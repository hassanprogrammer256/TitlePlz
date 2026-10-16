import fs from 'node:fs/promises';
import { RULES } from '../config/rules.js';
import { prisma } from '../db/client.js';
import type { Upload } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { inspectMp4 } from '../media/mp4.js';
import { readHead, sniffContentType } from '../media/sniff.js';
import { newKey, type MediaContentType } from '../storage/keys.js';
import { getStorage } from '../storage/index.js';

export type UploadKind = 'image' | 'video';

const ALLOWED: Record<UploadKind, readonly MediaContentType[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp'],
  video: ['video/mp4'],
};

const unsupported = (kind: UploadKind) =>
  new AppError(
    415,
    kind === 'image' ? 'Unsupported image. Upload a PNG, JPEG or WebP file.' : 'Unsupported video. Upload an MP4 file.',
    'UNSUPPORTED_MEDIA_TYPE',
  );

/**
 * Validates a freshly received temp file (type by magic bytes, clip length from the MP4
 * header), stores it, and records it. The caller owns deleting the temp file.
 */
export async function saveUpload(input: { userId: string; kind: UploadKind; tempPath: string }): Promise<Upload> {
  const { userId, kind, tempPath } = input;
  const storage = getStorage();

  const recent = await prisma.upload.count({
    where: { userId, dropId: null, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
  });
  if (recent >= RULES.MAX_UNATTACHED_UPLOADS_PER_DAY) {
    throw AppError.tooManyRequests('Too many unused uploads. Post a drop with them, or try again tomorrow.');
  }

  const { size } = await fs.stat(tempPath);
  if (size === 0) throw AppError.badRequest('The uploaded file is empty');
  const limit = kind === 'image' ? RULES.IMAGE_MAX_BYTES : RULES.VIDEO_MAX_BYTES;
  if (size > limit) throw new AppError(413, `File too large (max ${limit / (1024 * 1024)} MB)`, 'PAYLOAD_TOO_LARGE');

  const contentType = sniffContentType(await readHead(tempPath));
  if (!contentType || !ALLOWED[kind].includes(contentType)) throw unsupported(kind);

  let durationSeconds: number | null = null;
  if (kind === 'video') {
    const info = await inspectMp4(tempPath);
    if (info?.fragmented && !(info.durationSeconds > 0)) {
      throw AppError.unprocessable('This is a fragmented MP4 (typical of screen recorders), so its length cannot be read. Re-save it as a standard MP4 and upload again.');
    }
    const seconds = info?.durationSeconds ?? null;
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
      throw AppError.unprocessable('Could not read the clip length. Upload a standard MP4 file.');
    }
    durationSeconds = Math.ceil(seconds);
    if (durationSeconds > RULES.MAX_CLIP_SECONDS) {
      throw AppError.unprocessable(`Clip is ${durationSeconds} s long; the maximum is ${RULES.MAX_CLIP_SECONDS} s (10 minutes)`);
    }
  }

  const key = newKey(userId, contentType);
  await storage.put(key, { filePath: tempPath, contentType, sizeBytes: size });
  try {
    return await prisma.upload.create({
      data: { key, userId, kind, contentType, sizeBytes: size, durationSeconds },
    });
  } catch (err) {
    await storage.delete(key).catch(() => {}); // don't leave an unreferenced object behind
    throw err;
  }
}
