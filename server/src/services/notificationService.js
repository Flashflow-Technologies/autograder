import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

let transporter = null;

/**
 * Lazily build a Nodemailer transport. Uses free Gmail SMTP (or any SMTP) from
 * env. If SMTP is not configured, emails are logged instead of sent so the
 * system runs without email credentials during development.
 */
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP not configured — emails will be logged, not sent');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * Send an email. Returns true if sent, false if only logged. Never throws —
 * notification failure must not break the primary operation.
 */
export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    logger.info('Email (not sent — SMTP off)', { to, subject });
    return false;
  }
  try {
    const info = await t.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text: text || stripHtml(html),
      html,
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return true;
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    return false;
  }
}

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ===== Templates ===== */

export function examScheduledEmail({ studentName, examTitle, examType, dateStr, startStr, durationMins, venue }) {
  return {
    subject: `Exam scheduled: ${examTitle} (${examType})`,
    html: `
      <h2>Exam Scheduled</h2>
      <p>Dear ${studentName},</p>
      <p>An exam has been scheduled for you:</p>
      <ul>
        <li><strong>${examTitle}</strong> — ${examType}</li>
        <li>Date: ${dateStr}</li>
        <li>Start: ${startStr} · Duration: ${durationMins} minutes</li>
        ${venue ? `<li>Venue: ${venue}</li>` : ''}
      </ul>
      <p>You can access the exam only during the scheduled window. Please log in a few minutes before the start time.</p>`,
  };
}

export function resultPublishedEmail({ studentName, examTitle, examType }) {
  return {
    subject: `Result published: ${examTitle} (${examType})`,
    html: `
      <h2>Result Published</h2>
      <p>Dear ${studentName},</p>
      <p>Your result for <strong>${examTitle}</strong> (${examType}) has been published and reviewed by faculty.</p>
      <p>Log in to view your score, per-question feedback, and CO attainment. If you wish to request a re-evaluation, you can do so from your result page before the appeal deadline.</p>`,
  };
}

export function appealResolvedEmail({ studentName, examTitle, outcome, revisedScore }) {
  return {
    subject: `Appeal ${outcome === 'revised' ? 'accepted' : 'reviewed'}: ${examTitle}`,
    html: `
      <h2>Appeal Outcome</h2>
      <p>Dear ${studentName},</p>
      <p>Your re-evaluation request for <strong>${examTitle}</strong> has been reviewed.</p>
      <p>Outcome: <strong>${outcome === 'revised' ? 'Score revised' : 'Original score upheld'}</strong>${
        outcome === 'revised' && revisedScore != null ? ` — new score for the appealed question: ${revisedScore}` : ''
      }.</p>
      <p>This decision is final. Log in to view your updated result.</p>`,
  };
}
