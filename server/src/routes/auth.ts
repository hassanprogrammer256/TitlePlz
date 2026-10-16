import { Router } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/password.js';
import { clearSessionCookie, setSessionCookie } from '../auth/session.js';
import { ALL_ROLES } from '../config/rules.js';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { authenticate, registerUser, toSelfDto } from '../services/authService.js';

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]{3,20}$/, 'must be 3-20 letters, numbers or underscores'),
    password: z.string().min(PASSWORD_MIN, `must be at least ${PASSWORD_MIN} characters`).max(PASSWORD_MAX),
    role: z.enum(ALL_ROLES).default('detective'),
  })
  .strict();

const loginSchema = z
  .object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(PASSWORD_MAX) })
  .strict();

const switchSchema = z.object({ userId: z.string().min(1).max(64) }).strict();

// Failed logins only: successful ones don't count against the budget.
const loginLimiter = createLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, try again in a few minutes',
});
const registerLimiter = createLimiter({ windowMs: 60 * 60_000, limit: 10, message: 'Too many sign-ups from this address, try again later' });

/** `devTools` enables /switch-user. It must only be true in development. */
export function createAuthRouter({ devTools }: { devTools: boolean }) {
  const router = Router();

  router.post('/auth/register', registerLimiter, validate({ body: registerSchema }), async (req, res) => {
    const { username, password, role } = req.body as z.infer<typeof registerSchema>;
    if (role === 'curator') throw AppError.forbidden('The curator role is granted by an administrator');

    const user = await registerUser({ username, password, role });
    setSessionCookie(res, user.id);
    res.status(201).json({ user: await toSelfDto(user) });
  });

  router.post('/auth/login', loginLimiter, validate({ body: loginSchema }), async (req, res) => {
    const { username, password } = req.body as z.infer<typeof loginSchema>;
    const user = await authenticate(username, password);
    setSessionCookie(res, user.id);
    res.json({ user: await toSelfDto(user) });
  });

  router.post('/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, async (req, res) => {
    res.json({ user: await toSelfDto(req.user!) });
  });

  if (devTools) {
    // Development-only impersonation used by the demo UI. Never mounted otherwise.
    router.post('/auth/switch-user', validate({ body: switchSchema }), async (req, res) => {
      const { userId } = req.body as z.infer<typeof switchSchema>;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw AppError.notFound('Detective not found');
      setSessionCookie(res, user.id);
      res.json({ user: await toSelfDto(user) });
    });
  }

  return router;
}
