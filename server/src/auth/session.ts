import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const SESSION_COOKIE = 'tp_session';

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration "${value}"`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

const SESSION_MS = durationToMs(config.JWT_EXPIRES_IN);

export function signSession(userId: string): string {
  return jwt.sign({}, config.JWT_SECRET, { algorithm: 'HS256', subject: userId, expiresIn: Math.floor(SESSION_MS / 1000) });
}

/** Returns the user id if the token is valid and unexpired, otherwise null. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };
}

export function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, signSession(userId), { ...cookieOptions(), maxAge: SESSION_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
