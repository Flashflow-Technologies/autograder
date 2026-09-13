import mongoose from 'mongoose';
import { Readable } from 'stream';
import logger from '../utils/logger.js';

// Stores images embedded in question papers (diagrams, figures) in their own
// GridFS bucket, kept separate from answer scans for clarity and lifecycle.
const { GridFSBucket, ObjectId } = mongoose.mongo;
const BUCKET_NAME = 'questionImages';

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not ready for image storage');
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

/** Store an image buffer; resolves to the stored file's ObjectId (string). */
export function storeQuestionImage(buffer, filename, contentType, meta = {}) {
  return new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(filename || 'question.png', {
      contentType: contentType || 'image/png',
      metadata: meta,
    });
    Readable.from(buffer).pipe(stream)
      .on('error', (err) => { logger.error('Question image store failed', { error: err.message }); reject(err); })
      .on('finish', () => resolve(stream.id.toString()));
  });
}

/** Open a download stream for a stored image. Returns { stream, file }. */
export async function openQuestionImage(fileId) {
  let _id;
  try { _id = new ObjectId(String(fileId)); } catch { throw new Error('Invalid image id'); }
  const files = await bucket().find({ _id }).toArray();
  if (!files.length) throw new Error('Image not found');
  return { stream: bucket().openDownloadStream(_id), file: files[0] };
}

/** Read a stored image fully into a Buffer (for embedding in documents). */
export async function readQuestionImageBuffer(fileId) {
  const { stream, file } = await openQuestionImage(fileId);
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return { buffer: Buffer.concat(chunks), contentType: file.contentType || 'image/png' };
}

/** Delete a stored image (best-effort). */
export async function deleteQuestionImage(fileId) {
  try {
    await bucket().delete(new ObjectId(String(fileId)));
  } catch (err) {
    logger.warn('Question image delete failed (non-fatal)', { fileId, error: err.message });
  }
}
