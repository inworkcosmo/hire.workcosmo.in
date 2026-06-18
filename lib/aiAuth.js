const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const ACTIVE_STATUSES = new Set(['trialing', 'active', 'grace']);
const MODULE_FEATURES = {
  app: 'recruitModule',
  careers: 'careerPortal',
  share: 'shareProfile'
};

function normalizeClientId(value = '') {
  return String(value).toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function resolvePlanFeatures(subscription = {}, company = {}) {
  const base = ['recruitModule', 'careerPortal', 'shareProfile', 'qrBridgeLogin', 'advancedAnalytics'];
  const custom = subscription.customFeatures || subscription.features || company.features;
  return Array.isArray(custom) && custom.length ? custom : base;
}

function isSubscriptionUsable(subscription, company) {
  if (!subscription) return company?.status === 'active';
  if (!ACTIVE_STATUSES.has(subscription.status)) return false;

  const expiry = subscription.currentPeriodEnd || subscription.trialEndsAt || subscription.expiresAt;
  if (!expiry) return true;

  const expiryDate = expiry.toDate ? expiry.toDate() : new Date(expiry.seconds ? expiry.seconds * 1000 : expiry);
  if (Number.isNaN(expiryDate.getTime())) return true;

  const accessUntil = new Date(expiryDate);
  accessUntil.setDate(accessUntil.getDate() + Number(subscription.gracePeriodDays || 0));
  return accessUntil >= new Date();
}

async function getAuthedContext(req, moduleKey = 'app') {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    const err = new Error('Missing Firebase ID token.');
    err.statusCode = 401;
    throw err;
  }

  const decoded = await admin.auth().verifyIdToken(token);
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.exists || userSnap.data().status !== 'active') {
    const err = new Error('User is inactive or not provisioned.');
    err.statusCode = 403;
    throw err;
  }

  const user = { id: userSnap.id, ...userSnap.data() };
  const requestedCompanyId = normalizeClientId(req.body?.companyId || req.body?.clientId || req.body?.subdomain || user.companyId);
  const userCompanyId = normalizeClientId(user.companyId || user.clientId || user.subdomain);
  if (!requestedCompanyId || requestedCompanyId !== userCompanyId) {
    const err = new Error('This login does not belong to the requested workspace.');
    err.statusCode = 403;
    throw err;
  }

  const companySnap = await db.collection('companies').doc(userCompanyId).get();
  if (!companySnap.exists) {
    const err = new Error('Workspace not found.');
    err.statusCode = 404;
    throw err;
  }

  const company = { id: companySnap.id, ...companySnap.data() };
  let subscription = null;
  if (company.subscriptionId) {
    const subSnap = await db.collection('subscriptions').doc(company.subscriptionId).get();
    if (subSnap.exists) subscription = { id: subSnap.id, ...subSnap.data() };
  }

  const feature = MODULE_FEATURES[moduleKey] || moduleKey;
  if (company.status !== 'active' || !isSubscriptionUsable(subscription, company)) {
    const err = new Error('Workspace subscription is inactive.');
    err.statusCode = 403;
    throw err;
  }
  if (!resolvePlanFeatures(subscription, company).includes(feature)) {
    const err = new Error('This AI feature is not enabled for the workspace.');
    err.statusCode = 403;
    throw err;
  }

  return { decoded, user, company, subscription };
}

async function reserveAiCredit(companyId, userId, action, credits = 1) {
  const companyRef = db.collection('companies').doc(companyId);
  const ledgerRef = db.collection('aiCreditLedger').doc();

  await db.runTransaction(async (transaction) => {
    const companySnap = await transaction.get(companyRef);
    const remaining = Number(companySnap.data()?.aiCreditsRemaining || 0);
    if (remaining < credits) {
      const err = new Error('No AI credits remaining. Add credits to this company in the Access Portal.');
      err.statusCode = 402;
      throw err;
    }

    transaction.update(companyRef, {
      aiCreditsRemaining: remaining - credits,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    transaction.set(ledgerRef, {
      companyId,
      userId,
      action,
      credits,
      status: 'reserved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return ledgerRef.id;
}

async function completeAiCredit(ledgerId, status, metadata = {}) {
  await db.collection('aiCreditLedger').doc(ledgerId).set({
    status,
    ...metadata,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function refundAiCredit(companyId, ledgerId, credits = 1, reason = '') {
  const companyRef = db.collection('companies').doc(companyId);
  const ledgerRef = db.collection('aiCreditLedger').doc(ledgerId);
  await db.runTransaction(async (transaction) => {
    const companySnap = await transaction.get(companyRef);
    const remaining = Number(companySnap.data()?.aiCreditsRemaining || 0);
    transaction.update(companyRef, {
      aiCreditsRemaining: remaining + credits,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    transaction.set(ledgerRef, {
      status: 'failed',
      failureReason: reason,
      refundedCredits: credits,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function callHuggingFaceJson({ model, messages, temperature = 0.2 }) {
  if (!process.env.HF_API_TOKEN) {
    const err = new Error('HF_API_TOKEN is not configured.');
    err.statusCode = 500;
    throw err;
  }

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error?.message || payload.error || 'Hugging Face request failed.');
    err.statusCode = response.status;
    throw err;
  }

  const content = payload.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

function sendError(res, error) {
  const status = error.statusCode || 500;
  res.status(status).json({ error: error.message || 'Unexpected server error.' });
}

module.exports = {
  admin,
  db,
  getAuthedContext,
  reserveAiCredit,
  completeAiCredit,
  refundAiCredit,
  callHuggingFaceJson,
  sendError
};
