import { Router } from 'express';
import { z } from 'zod';
import { RULES } from '../config/rules.js';
import { requireAdmin } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { getLeaderboard, toSeasonDto } from '../services/leaderboardService.js';
import { rolloverSeason } from '../services/seasonService.js';

const startSchema = z.object({ durationDays: z.number().int().min(1).max(366).default(RULES.SEASON_DAYS) });
const seasonLimiter = createLimiter({ windowMs: 60_000, limit: 5, message: 'Season changes are limited to 5 per minute' });

export const leaderboardRouter = Router();

/** Public. With a session, the caller's own row is flagged `isCurrent`. */
leaderboardRouter.get('/leaderboard', async (req, res) => {
  const { leaders, season } = await getLeaderboard(req.user?.id);
  res.json({ leaderboard: leaders, season });
});

/** Admin only: close the current season (tiers are recorded) and open the next one. */
leaderboardRouter.post('/season/start', requireAdmin, seasonLimiter, validate({ body: startSchema }), async (req, res) => {
  const { durationDays } = req.body as z.infer<typeof startSchema>;
  const next = await rolloverSeason({ durationDays, minAgeMs: 60_000 });
  const { leaders } = await getLeaderboard(req.user!.id);
  res.status(201).json({ season: toSeasonDto(next), leaders });
});
