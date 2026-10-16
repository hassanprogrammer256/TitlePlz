import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { toSelfDto } from '../services/authService.js';
import { followUser, getScoutFeed, unfollowUser } from '../services/scoutService.js';

const handleSchema = z.object({ handle: z.string().trim().min(1).max(64) });

export const scoutsRouter = Router();
scoutsRouter.use('/scouts', requireAuth);

scoutsRouter.get('/scouts/feed', async (req, res) => {
  res.json({ activities: await getScoutFeed(req.user!) });
});

scoutsRouter.post('/scouts/follow', validate({ body: handleSchema }), async (req, res) => {
  const { handle } = req.body as z.infer<typeof handleSchema>;
  await followUser(req.user!.id, handle);
  res.json({ user: await toSelfDto(req.user!) });
});

scoutsRouter.post('/scouts/unfollow', validate({ body: handleSchema }), async (req, res) => {
  const { handle } = req.body as z.infer<typeof handleSchema>;
  await unfollowUser(req.user!.id, handle);
  res.json({ user: await toSelfDto(req.user!) });
});
