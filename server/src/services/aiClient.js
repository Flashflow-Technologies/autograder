import logger from '../utils/logger.js';

const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Call the Python AI microservice to score one answer against a scheme entry.
 * Returns { components, score, confidence, foundKeywords, missingKeywords, feedback }.
 * On any failure, logs the error and returns a null-scored result flagged for
 * mandatory human review — the system degrades safely rather than crashing.
 */
export async function scoreAnswer({ answerText, schemeEntry }) {
  const payload = {
    answer_text: answerText || '',
    model_answer: schemeEntry.modelAnswer,
    mandatory_keywords: schemeEntry.mandatoryKeywords || [],
    bonus_keywords: schemeEntry.bonusKeywords || [],
    weights: schemeEntry.weights,
    rbtl: schemeEntry.rbtl,
    max_marks: schemeEntry.maxMarks,
    expected_length: schemeEntry.expectedLength || 'short',
  };

  try {
    const controller = new AbortController();
    // Longer, configurable timeout: the first scoring call may load the
    // embedding model and the Java grammar engine, which is slow on cold start.
    const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 60000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${AI_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI service responded ${res.status}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    logger.error('AI scoring failed — flagging answer for mandatory review', {
      error: err.message,
      questionNo: schemeEntry.questionNo,
      subLabel: schemeEntry.subLabel,
    });
    // Safe degradation: zero score, zero confidence, forces human review
    return {
      components: { cosine: 0, keywords: 0, style: 0, grammar: 0 },
      score: 0,
      confidence: 0,
      foundKeywords: [],
      missingKeywords: schemeEntry.mandatoryKeywords || [],
      feedback: 'Automated scoring was unavailable for this answer. It requires manual review.',
      aiUnavailable: true,
    };
  }
}

/** OCR a scanned answer image via the AI service. */
export async function ocrImage(buffer, filename) {
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    const res = await fetch(`${AI_URL}/ocr`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`OCR responded ${res.status}`);
    const { text } = await res.json();
    return text;
  } catch (err) {
    logger.error('OCR failed', { filename, error: err.message });
    return ''; // empty OCR -> answer flagged for review downstream
  }
}

/**
 * Generate draft questions from an uploaded notes file.
 * `spec` is an array of { co, rbtl, count, marks } — the caller must already
 * have clamped each rbtl to the CO's ceiling. Returns { questions, warning }.
 */
export async function generateQuestions(buffer, filename, spec, avoid) {
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    form.append('spec', JSON.stringify(spec));
    if (avoid && avoid.length) form.append('avoid', JSON.stringify(avoid));
    const controller = new AbortController();
    const timeoutMs = Number(process.env.AI_GENERATE_TIMEOUT_MS) || 120000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${AI_URL}/generate`, { method: 'POST', body: form, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Generate responded ${res.status}`);
    return await res.json(); // { pairs: [...], extractedText, warning }
  } catch (err) {
    logger.error('Question generation failed', { filename, error: err.message });
    throw err;
  }
}

/**
 * Get an extractive draft answer for a question from notes text.
 * Returns { draft, sentenceCount, warning } or throws.
 */
export async function draftAnswerFromNotes(question, notesText, marks) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 60000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_URL}/draft-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, notesText, marks }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`draft-answer responded ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(t);
    logger.error('Answer drafting failed', { error: err.message });
    throw err;
  }
}

/**
 * Ask the AI service to rank a question's semantic similarity to each CO
 * statement. Returns [{ coId, score }] sorted desc, or [] on failure (caller
 * then falls back to no CO suggestion — never blocks the faculty).
 */
export async function matchCos(question, cos) {
  if (!question || !Array.isArray(cos) || cos.length === 0) return [];
  try {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 60000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${AI_URL}/match-cos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, cos }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`AI service ${res.status}`);
    const data = await res.json();
    return data.matches || [];
  } catch (err) {
    logger.error('matchCos failed', { error: err.message });
    return [];
  }
}

/**
 * Parse an uploaded institution document (PDF/DOCX) into suggested statement
 * sections (Vision/Mission/PO/PSO/PEO/WK/Academic Objectives). Returns
 * { sections, unmatched, warning? } — suggestions only, for admin review.
 */
export async function parseOrgDocument(buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_GENERATE_TIMEOUT_MS) || 120000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_URL}/parse-org-document`, { method: 'POST', body: form, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Parse responded ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(t);
    logger.error('Org document parse failed', { filename, error: err.message });
    throw err;
  }
}
