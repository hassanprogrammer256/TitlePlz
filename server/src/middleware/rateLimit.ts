import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';
import { AppError } from '../lib/errors.js';

type Options = { windowMs: number; limit: number; message?: string; enableInTest?: boolean; skipSuccessfulRequests?: boolean };

/** Per-IP limiter. Disabled under NODE_ENV=test unless `enableInTest` is set. */
export function createLimiter({ windowMs, limit, message = 'Too many requests, slow down', enableInTest = false, skipSuccessfulRequests = false }: Options) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: () => config.NODE_ENV === 'test' && !enableInTest,
    handler: (_req, _res, next) => next(AppError.tooManyRequests(message)),
  });
}

/** Broad safety net for the whole API. */
export const apiLimiter = createLimiter({ windowMs: 60_000, limit: 300 });
