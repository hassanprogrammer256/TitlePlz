import type { RequestHandler } from 'express';
import { SESSION_COOKIE, clearSessionCookie, verifySession } from '../auth/session.js';
import { prisma } from '../db/client.js';
import type { User } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `attachUser` when the session cookie is valid and the user still exists. */
      user?: User;
    }
  }
}

/** Optional auth: populates `req.user` if there is a valid session, never rejects. */
export const attachUser: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = verifySession(token);
  if (!userId) return next();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) req.user = user;
  else clearSessionCookie(res); // account was deleted; drop the dead cookie
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  next();
};

export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!req.user.isAdmin && !roles.includes(req.user.role)) return next(AppError.forbidden('Your role cannot do that'));
    next();
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!req.user.isAdmin) return next(AppError.forbidden('Administrator access required'));
  next();
};
