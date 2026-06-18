const {
  admin,
  db,
  getAuthedContext,
  callHuggingFaceJson,
  sendError
} = require('../../lib/aiAuth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    
    // We don't strictly require authentication for the career portal chat to be accessible 
    // to all candidates, but we check company context.
    const { message, history = [], companyId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    // We can fetch open jobs to inject into the system prompt for better recommendations
    let jobsContext = "";
    if (companyId) {
      const jobsSnap = await db.collection('jobs')
        .where('companyId', '==', companyId)
        .where('status', '==', 'Open')
        .get();
      
      const jobsList = jobsSnap.docs.map(doc => {
        const data = doc.data();
        return `- Job ID: ${doc.id} | Title: ${data.title} | Dept: ${data.department || 'General'} | Loc: ${data.location || 'Remote'}`;
      }).join('\n');
      
      if (jobsList) {
        jobsContext = `\n\nHere are the currently open jobs at this company:\n${jobsList}`;
      } else {
        jobsContext = `\n\nThere are currently no open jobs at this company.`;
      }
    }

    const model = process.env.HF_CHAT_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
    
    // Format messages for the API
    const messages = [
      {
        role: 'system',
        content: `You are a helpful AI recruiting assistant for a career portal. 
Your goal is to help candidates find suitable roles and answer their questions about the company.
Keep your conversational answers brief, friendly, and professional (under 3-4 sentences max). 
Do NOT make up information. Use only the provided context.
If the candidate asks about open roles, or if you find a good match based on their request, you must include the matching Job IDs in the "suggestedJobIds" array.
You must reply in strict JSON format with exactly two keys: "message" (string) and "suggestedJobIds" (array of strings). Example: {"message": "Here are some remote developer roles for you!", "suggestedJobIds": ["12345", "67890"]}${jobsContext}`
      },
      // Keep only last 5 messages for context length
      ...history.slice(-5),
      { role: 'user', content: message }
    ];

    const parsed = await callHuggingFaceJson({
      model,
      messages,
      temperature: 0.6
    });

    res.status(200).json({ 
      success: true, 
      response: parsed.message || "I'm sorry, I couldn't understand that.",
      suggestedJobIds: Array.isArray(parsed.suggestedJobIds) ? parsed.suggestedJobIds : []
    });
  } catch (error) {
    sendError(res, error);
  }
};
