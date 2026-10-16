import { Router } from 'express';
import { config } from '../config/env.js';
import { prisma } from '../db/client.js';
import { toUserDto } from '../dto/user.js';
import { AppError } from '../lib/errors.js';
import { getUserStats } from '../services/userStatsService.js';

export const usersRouter = Router();

/**
 * Public profiles, best first (top 200). Requires a session, except in development where the
 * (pre-login) demo-agent picker on the auth page needs the list. A signed-in caller is always
 * included, along with the detectives they scout, even when they fall outside the top 200.
 */
usersRouter.get('/users', async (req, res) => {
  if (!req.user && !config.isDev) throw AppError.unauthorized();

  const users = await prisma.user.findMany({ orderBy: [{ points: 'desc' }, { createdAt: 'asc' }], take: 200 });
  if (req.user) {
    const have = new Set(users.map((u) => u.id));
    const followed = await prisma.follow.findMany({ where: { followerId: req.user.id }, select: { followingId: true } });
    const missing = [req.user.id, ...followed.map((f) => f.followingId)].filter((id) => !have.has(id));
    if (missing.length) users.push(...(await prisma.user.findMany({ where: { id: { in: missing } } })));
  }
  const stats = await getUserStats(users.map((u) => u.id));
  res.json({
    users: users.map((u) => toUserDto(u, { self: u.id === req.user?.id, stats: stats.get(u.id) })),
  });
});
