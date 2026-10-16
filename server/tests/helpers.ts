import { randomBytes } from 'node:crypto';
import type { Response } from 'supertest';

export const uniqueName = (prefix = 'user') => `${prefix}_${randomBytes(4).toString('hex')}`;

/** "tp_session=abc; Path=/; HttpOnly" -> "tp_session=abc" (ready to send back as a Cookie header). */
export function sessionCookie(res: Response): string | undefined {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = list.find((c) => c.startsWith('tp_session='));
  return found?.split(';')[0];
}

export const PASSWORD = 'correct-horse-battery';
