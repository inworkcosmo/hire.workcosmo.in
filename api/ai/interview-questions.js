const {
  db,
  getAuthedContext,
  reserveAiCredit,
  completeAiCredit,
  refundAiCredit,
  callHuggingFaceJson,
  sendError,
  admin
} = require('../../lib/aiAuth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let ctx;
  let ledgerId;
  try {
    ctx = await getAuthedContext(req, 'app');
    ledgerId = await reserveAiCredit(ctx.company.id, ctx.user.id, 'interview_questions', 1);

    const {
      candidateId = '',
      jobTitle = '',
      jobDescription = '',
      skills = '',
      candidateSummary = '',
      difficulty = 'mid',
      save = false
    } = req.body || {};

    const model = process.env.HF_QUESTION_MODEL || process.env.HF_CHAT_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
    const generated = await callHuggingFaceJson({
      model,
      messages: [
        {
          role: 'system',
          content: 'Create interview questions. Return strict JSON only: { "questions": [{ "type": "technical|behavioral|screening", "question": "...", "expectedSignal": "..." }] }.'
        },
        {
          role: 'user',
          content: JSON.stringify({ jobTitle, jobDescription, skills, candidateSummary, difficulty })
        }
      ]
    });

    if (candidateId && save) {
      const candidateRef = db.collection('candidates').doc(candidateId);
      const candidateSnap = await candidateRef.get();
      if (!candidateSnap.exists || candidateSnap.data().companyId !== ctx.company.id) {
        throw new Error('Candidate not found in this workspace.');
      }
      await candidateRef.set({
        aiInterviewQuestionsDraft: generated.questions || generated,
        aiInterviewQuestionsGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiInterviewQuestionsGeneratedBy: ctx.user.id
      }, { merge: true });
    }

    await completeAiCredit(ledgerId, 'succeeded', { action: 'interview_questions', candidateId });
    res.status(200).json({ success: true, creditsUsed: 1, generated });
  } catch (error) {
    if (ctx && ledgerId) {
      await refundAiCredit(ctx.company.id, ledgerId, 1, error.message).catch(() => {});
    }
    sendError(res, error);
  }
};
