/**
 * One-time migration: convert the legacy single `cohort` string on Assessment
 * documents into the new `cohorts` array (multi-cohort targeting).
 *
 *   { cohort: "2021-CSE-A" }  ->  { cohorts: ["2021-CSE-A"] }
 *
 * Design notes:
 *  - Idempotent and safe to run multiple times. A document is migrated only if
 *    it has a non-empty legacy `cohort` and does NOT already have a populated
 *    `cohorts` array. Re-running does nothing further.
 *  - Non-destructive: the legacy `cohort` field is left in place (not unset), so
 *    the migration is reversible and the read-path fallbacks in the app continue
 *    to work regardless. If you want to remove the legacy field afterwards, run
 *    with the --unset-legacy flag (see below) once you have verified the result.
 *  - Operates at the raw collection level via the native driver, because the
 *    updated Mongoose schema no longer defines `cohort`, so a normal Mongoose
 *    query would not surface the legacy value.
 *
 * Run with:            npm run migrate:assessment-cohorts
 * Remove legacy field: npm run migrate:assessment-cohorts -- --unset-legacy
 *
 * Always back up the database before running a migration.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import logger from './logger.js';

async function run() {
  const unsetLegacy = process.argv.includes('--unset-legacy');
  await connectDB();

  // Work directly on the collection so we can read the legacy `cohort` field
  // that the current Mongoose schema no longer defines.
  const col = mongoose.connection.collection('assessments');

  const total = await col.countDocuments({});
  // Candidates: have a legacy cohort string, and no populated cohorts array yet.
  const cursor = col.find({
    cohort: { $exists: true, $nin: [null, ''] },
    $or: [{ cohorts: { $exists: false } }, { cohorts: { $size: 0 } }],
  });

  let migrated = 0;
  let skipped = 0;
  const examples = [];

  for await (const doc of cursor) {
    const legacy = typeof doc.cohort === 'string' ? doc.cohort.trim() : '';
    if (!legacy) { skipped += 1; continue; }

    const update = { $set: { cohorts: [legacy] } };
    if (unsetLegacy) update.$unset = { cohort: '' };

    await col.updateOne({ _id: doc._id }, update);
    migrated += 1;
    if (examples.length < 5) examples.push(`${doc._id}: "${legacy}" -> ["${legacy}"]`);
  }

  // Report anything already in the target state, and anything with neither field.
  const alreadyArray = await col.countDocuments({ cohorts: { $exists: true, $not: { $size: 0 } } });
  const orphans = await col.countDocuments({
    $and: [
      { $or: [{ cohort: { $exists: false } }, { cohort: { $in: [null, ''] } }] },
      { $or: [{ cohorts: { $exists: false } }, { cohorts: { $size: 0 } }] },
    ],
  });

  logger.info('Assessment cohort migration complete', {
    totalAssessments: total,
    migrated,
    skippedEmptyLegacy: skipped,
    alreadyHadCohortsArray: alreadyArray,
    withNoCohortAtAll: orphans,
    removedLegacyField: unsetLegacy,
  });

  if (examples.length) logger.info('Examples of migrated records', { examples });
  if (orphans > 0) {
    logger.warn(
      `${orphans} assessment(s) have neither a legacy cohort nor a cohorts array. ` +
      'These need a cohort assigned manually before their students can see them.'
    );
  }

  await disconnectDB();
}

run().catch((err) => {
  logger.error('Assessment cohort migration failed', { error: err.message });
  process.exit(1);
});
