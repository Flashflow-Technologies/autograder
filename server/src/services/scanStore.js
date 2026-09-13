import mongoose from 'mongoose';
import { Readable } from 'stream';
import logger from '../utils/logger.js';

// GridFSBucket and ObjectId come from mongoose's bundled mongodb driver, so we
// don't need 'mongodb' as a direct dependency.
const { GridFSBucket, ObjectId } = mongoose.mongo;

const BUCKET_NAME = 'answerScans';

/**
 * Lazily create a GridFSBucket on the active mongoose connection. We don't
 * create it at import time because the DB connection may not be open yet.
 */
function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not ready for scan storage');
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

/**
 * Store an image buffer in GridFS. Returns the stored file's ObjectId (string).
 * Metadata records who uploaded it and for which exam, for auditability.
 */
export function storeScan(buffer, filename, contentType, meta = {}) {
  return new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(filename || 'scan.png', {
      contentType: contentType || 'image/png',
      metadata: meta,
    });
    Readable.from(buffer).pipe(stream)
      .on('error', (err) => {
        logger.error('Scan store failed', { error: err.message });
        reject(err);
      })
      .on('finish', () => resolve(stream.id.toString()));
  });
}

/**
 * Open a download stream for a stored scan by id. Returns { stream, file }.
 * Throws if the id is malformed or the file does not exist.
 */
export async function openScan(fileId) {
  let _id;
  try {
    _id = new ObjectId(String(fileId));
  } catch {
    throw new Error('Invalid scan id');
  }
  const files = await bucket().find({ _id }).toArray();
  if (!files.length) throw new Error('Scan not found');
  return { stream: bucket().openDownloadStream(_id), file: files[0] };
}

/** Delete a stored scan (best-effort; used if a student replaces an upload). */
export async function deleteScan(fileId) {
  try {
    await bucket().delete(new ObjectId(String(fileId)));
  } catch (err) {
    logger.warn('Scan delete failed (non-fatal)', { fileId, error: err.message });
  }
}
