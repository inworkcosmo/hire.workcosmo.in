if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}

const {
  admin,
  callHuggingFaceJson,
  sendError
} = require('../../lib/aiAuth');

async function extractTextFromResume({ resumeText, resumeUrl }) {
  if (resumeText && String(resumeText).trim()) return String(resumeText).slice(0, 25000);
  if (!resumeUrl) throw new Error('Provide resumeUrl or resumeText.');

  const response = await fetch(resumeUrl);
  if (!response.ok) throw new Error('Could not download resume.');
  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const lowerUrl = resumeUrl.toLowerCase().split('?')[0];

  if (contentType.includes('pdf') || lowerUrl.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return String(parsed.text || '').slice(0, 25000);
  }

  if (contentType.includes('word') || lowerUrl.endsWith('.docx')) {
    const mammoth = require('mammoth');
    const parsed = await mammoth.extractRawText({ buffer });
    return String(parsed.value || '').slice(0, 25000);
  }

  throw new Error('Resume format is not supported for AI parsing. Upload a PDF or DOCX.');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Missing Firebase ID token.' });
    }
    
    // Verify Firebase token directly to authenticate candidate
    await admin.auth().verifyIdToken(token);

    const resumeText = await extractTextFromResume(req.body || {});
    const model = process.env.HF_RESUME_MODEL || process.env.HF_CHAT_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
    const parsed = await callHuggingFaceJson({
      model,
      messages: [
        {
          role: 'system',
          content: 'Extract candidate profile fields from resumes. Return strict JSON only with keys: name,email,phone,city,state,addressLine1,addressLine2,pincode,gender,qualification,experience,currentCompany,currentDesignation,skills,summary.'
        },
        { role: 'user', content: resumeText }
      ]
    });

    res.status(200).json({ success: true, creditsUsed: 0, parsed });
  } catch (error) {
    sendError(res, error);
  }
};
