/**
 * One-time migration: convert any existing decimal scores to whole-number marks
 * (standard rounding), so historical data matches the new "integer marks everywhere"
 * policy. Safe to run multiple times (ceil of an integer is the same integer).
 *
 * Run with:  npm run migrate:scores
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { Score } from '../models/index.js';
import logger from './logger.js';

async function run() {
  await connectDB();
  const scores = await Score.find({});
  let changed = 0;

  for (const score of scores) {
    let dirty = false;
    for (const sub of score.subScores) {
      const rounded = Math.min(Math.round(sub.finalScore), sub.maxMarks);
      if (rounded !== sub.finalScore) { sub.finalScore = rounded; dirty = true; }
    }
    // Recompute total from the (now integer) selected sides.
    const selectedByGroup = {};
    (score.orSelections || []).forEach((o) => { selectedByGroup[o.groupIndex] = o.selectedQuestionNo; });
    let total = 0;
    for (const s of score.subScores) {
      const sel = selectedByGroup[s.groupIndex];
      if (sel === undefined || s.questionNo === sel) total += s.finalScore;
    }
    if (total !== score.totalScore) { score.totalScore = total; dirty = true; }

    if (dirty) { await score.save(); changed += 1; }
  }

  logger.info(`Score migration complete: ${changed} of ${scores.length} score records updated to integer marks.`);
  await disconnectDB();
}

run().catch((err) => { logger.error('Score migration failed', { error: err.message }); process.exit(1); });
