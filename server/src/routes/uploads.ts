import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import { RULES } from '../config/rules.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { saveUpload, type UploadKind } from '../services/uploadService.js';
import { getStorage } from '../storage/index.js';

const TMP_DIR = path.join(os.tmpdir(), 'titleplz-uploads');
fs.mkdirSync(TMP_DIR, { recursive: true });

function makeParser(maxBytes: number) {
  return multer({
    storage: multer.diskStorage({
      destination: TMP_DIR,
      filename: (_req, _file, cb) => cb(null, randomBytes(16).toString('hex')),
    }),
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2 },
  }).single('file');
}
const parsers: Record<UploadKind, ReturnType<typeof makeParser>> = {
  image: makeParser(RULES.IMAGE_MAX_BYTES),
  video: makeParser(RULES.VIDEO_MAX_BYTES),
};

function parse(kind: UploadKind, req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    parsers[kind](req, res, (err: unknown) => {
      if (!err) return resolve();
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = (kind === 'image' ? RULES.IMAGE_MAX_BYTES : RULES.VIDEO_MAX_BYTES) / (1024 * 1024);
          return reject(new AppError(413, `File too large (max ${mb} MB)`, 'PAYLOAD_TOO_LARGE'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') return reject(AppError.badRequest('Send exactly one file in the "file" field'));
        return reject(AppError.badRequest(`Invalid upload: ${err.message}`));
      }
      reject(err);
    });
  });
}

const querySchema = z.object({ kind: z.enum(['image', 'video']) });
const uploadLimiter = createLimiter({ windowMs: 60 * 60_000, limit: 60, message: 'Too many uploads, try again later' });

export const uploadsRouter = Router();

/** multipart/form-data with one `file` field. `?kind=image|video` picks the allowed types and size limit. */
uploadsRouter.post('/uploads', requireAuth, uploadLimiter, validate({ query: querySchema }), async (req, res) => {
  const { kind } = req.query as unknown as z.infer<typeof querySchema>;
  await parse(kind, req, res);

  const tempPath = req.file?.path;
  if (!tempPath) throw AppError.badRequest('No file received. Send it in the "file" field.');
  try {
    const upload = await saveUpload({ userId: req.user!.id, kind, tempPath });
    res.status(201).json({
      upload: {
        key: upload.key,
        url: getStorage().publicUrl(upload.key),
        kind,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        ...(upload.durationSeconds != null ? { durationSeconds: upload.durationSeconds } : {}),
      },
    });
  } finally {
    await fs.promises.rm(tempPath, { force: true });
  }
});
