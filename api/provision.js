const admin = require('firebase-admin');

// Initialize Firebase Admin (Ensure serviceAccount is in env)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

function slugify(text) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

const PLAN_FEATURES = [
  'recruitModule',
  'careerPortal',
  'shareProfile',
  'qrBridgeLogin',
  'advancedAnalytics'
];

function resolvePlan(planId) {
  if (planId === 'plan_SoAKfnYYCTZHDo') {
    return { id: 'professional', maxUsers: 3, priceMonthly: 2999 };
  }
  if (planId === 'plan_SouJvWzj8xFSgg') {
    return { id: 'enterprise', maxUsers: 8, priceMonthly: 8999 };
  }
  return { id: 'starter', maxUsers: 1, priceMonthly: 1499 };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subscriptionId, name, email, company, mobile, planId, planName } = req.body;

  if (!subscriptionId || !email || !company) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const companySlug = slugify(company) || `workspace-${Date.now()}`;
    const tempPassword = "WorkCosmo@2026!";
    const plan = resolvePlan(planId);

    // 1. Create Firebase Auth User
    let uid;
    try {
      const userRecord = await admin.auth().createUser({
        email: email,
        password: tempPassword,
        displayName: name,
      });
      uid = userRecord.uid;
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        const existingUser = await admin.auth().getUserByEmail(email);
        uid = existingUser.uid;
      } else {
        throw error;
      }
    }

    // 2. Create Company Document
    const companyRef = db.collection('companies').doc(companySlug);
    await companyRef.set({
      companyId: companySlug,
      clientId: companySlug,
      subdomain: companySlug,
      companyName: company,
      ownerId: uid,
      ownerName: name,
      ownerEmail: email,
      subscriptionId: subscriptionId,
      plan: plan.id,
      maxUsers: plan.maxUsers,
      aiCreditsRemaining: 0,
      features: PLAN_FEATURES,
      customLimits: {},
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Create Admin User Profile inside /users collection
    const userRef = db.collection('users').doc(uid);
    await userRef.set({
      id: uid,
      companyId: companySlug,
      email: email,
      name: name,
      role: 'owner',
      status: 'active',
      inviteStatus: 'accepted',
      credentialsProvidedBy: 'platform_admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 4. Update Subscription
    await db.collection('subscriptions').doc(subscriptionId).set({
      companyId: companySlug,
      provisioningStatus: "completed",
      status: "active",
      plan: plan.id,
      maxUsers: plan.maxUsers,
      priceMonthly: plan.priceMonthly,
      features: PLAN_FEATURES
    }, { merge: true });

    res.status(200).json({
      success: true,
      subdomain: companySlug,
      email: email,
      tempPassword: tempPassword
    });

  } catch (error) {
    console.error('Provisioning Error:', error);
    res.status(500).json({ error: 'Failed to provision workspace' });
  }
};
