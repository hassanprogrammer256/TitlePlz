import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { CREDIT_PACKAGES } from '../config/rules.js';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { toSelfDto } from '../services/authService.js';
import { claimDailyRefill, purchaseCredits } from '../services/creditService.js';

const purchaseSchema = z
  .object({
    packageId: z.enum(Object.keys(CREDIT_PACKAGES) as [keyof typeof CREDIT_PACKAGES, ...(keyof typeof CREDIT_PACKAGES)[]]),
    // Only cross-checked against the package; the server never credits a client-supplied amount.
    amount: z.number().int().positive().optional(),
  })
  .strict();

const ledgerQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

const purchaseLimiter = createLimiter({ windowMs: 60 * 60_000, limit: 30, message: 'Too many purchases, try again later' });

/** `allowFakePurchases` enables the stub purchase endpoint; false answers 503 so nobody can mint credits. */
export function createCreditsRouter({ allowFakePurchases }: { allowFakePurchases: boolean }) {
  const router = Router();
  router.use('/credits', requireAuth);

  router.post('/credits/refill', async (req, res) => {
    const user = await claimDailyRefill(req.user!.id);
    res.json({ user: await toSelfDto(user) });
  });

  router.post('/credits/purchase', purchaseLimiter, validate({ body: purchaseSchema }), async (req, res) => {
    if (!allowFakePurchases) throw new AppError(503, 'Payments are not enabled yet', 'PAYMENTS_DISABLED');

    const { packageId, amount } = req.body as z.infer<typeof purchaseSchema>;
    if (amount !== undefined && amount !== CREDIT_PACKAGES[packageId]) {
      throw AppError.badRequest('Amount does not match the selected package');
    }
    // A client-supplied Idempotency-Key makes retries safe; otherwise every call is a new purchase.
    const header = req.get('idempotency-key');
    const key = header && /^[\w.:-]{8,100}$/.test(header) ? header : randomUUID();

    const user = await purchaseCredits(req.user!.id, packageId, key);
    res.json({ user: await toSelfDto(user) });
  });

  /** The caller's own credit history, newest first. */
  router.get('/credits/ledger', validate({ query: ledgerQuery }), async (req, res) => {
    const { limit } = req.query as unknown as z.infer<typeof ledgerQuery>;
    const rows = await prisma.creditLedger.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        delta: r.delta,
        balanceAfter: r.balanceAfter,
        reason: r.reason,
        refType: r.refType,
        refId: r.refId,
        createdAt: r.createdAt.getTime(),
      })),
    });
  });

  return router;
}
