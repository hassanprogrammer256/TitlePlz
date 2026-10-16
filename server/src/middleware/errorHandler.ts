import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '../generated/prisma/client.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', requestId: req.id });
};

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  // body-parser / express.json failures
  const e = err as { type?: string; status?: number; statusCode?: number };
  if (e?.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON body');
  if (e?.type === 'entity.too.large') return new AppError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return AppError.conflict('A record with that value already exists');
    if (err.code === 'P2025') return AppError.notFound('Record not found');
  }
  return null;
}

// Express requires the 4-arg signature to treat this as an error handler.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const known = toAppError(err);
  if (known) {
    const retryMs = (known.details as { retryAfterMs?: unknown } | undefined)?.retryAfterMs;
    if (known.status === 429 && typeof retryMs === 'number') res.setHeader('Retry-After', String(Math.ceil(retryMs / 1000)));
    res.status(known.status).json({
      error: known.message,
      code: known.code,
      ...(known.details !== undefined ? { details: known.details } : {}),
      requestId: req.id,
    });
    return;
  }

  logger.error({ err, requestId: req.id, method: req.method, url: req.originalUrl }, 'unhandled error');
  res.status(500).json({
    error: config.isProd ? 'Internal server error' : String((err as Error)?.message ?? 'Internal server error'),
    code: 'INTERNAL',
    requestId: req.id,
  });
};
