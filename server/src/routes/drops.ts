import { Router } from 'express';
import { z } from 'zod';
import { RULES } from '../config/rules.js';
import { toDropDto } from '../dto/drop.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { broadcast, dropViewerCount } from '../realtime/io.js';
import { toSelfDto } from '../services/authService.js';
import { notifyCredits } from '../services/creditService.js';
import { createDrop, decodeCursor, getDrop, listDrops } from '../services/dropService.js';
import { notifyScouts } from '../services/scoutService.js';

const label = (max: number) => z.string().trim().max(max).default('');

const createSchema = z
  .object({
    title: z.string().trim().min(1, 'is required').max(200),
    releaseYear: z.number().int().min(1888).max(new Date().getFullYear() + 1),
    mediaType: z.enum(['photo', 'clip']),
    // Accepted for compatibility with the client form but ignored: the server reads the real length from the MP4.
    clipDurationSeconds: z.number().optional(),
    validityDurationHours: z.number().int().min(RULES.MIN_VALIDITY_HOURS).max(RULES.MAX_VALIDITY_HOURS),
    bountyPts: z.number().int().min(RULES.MIN_BOUNTY).max(RULES.MAX_BOUNTY),
    timecode: z.string().trim().max(24).default('00:00:00:00'),
    source: z.string().trim().max(80).default('User Upload'),
    aspectRatioLabel: label(160),
    spectralLabel: label(160),
    fpsLabel: label(160),
    audioStemLabel: label(160),
    targetPropNote: z.string().trim().max(400).optional(),
    tags: z.array(z.string().max(50)).max(30).default([]),
    imageKey: z.string().min(1).max(200),
    videoKey: z.string().min(1).max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mediaType === 'clip' && !v.videoKey) ctx.addIssue({ code: 'custom', path: ['videoKey'], message: 'is required for a clip' });
    if (v.mediaType === 'photo' && v.videoKey) ctx.addIssue({ code: 'custom', path: ['videoKey'], message: 'is only allowed for a clip' });
  });

const listQuery = z.object({
  status: z.enum(['all', 'open', 'solved', 'expired']).default('all'),
  mine: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  tag: z
    .string()
    .trim()
    .transform((t) => t.replace(/^#/, '').toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_]{1,30}$/))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(100).optional(),
});

const idParams = z.object({ id: z.string().min(1).max(64) });

export const dropsRouter = Router();

/** Public feed (answers hidden). With a session, the caller's own trials are included. */
dropsRouter.get('/drops', validate({ query: listQuery }), async (req, res) => {
  const q = req.query as unknown as z.infer<typeof listQuery>;
  if (q.mine && !req.user) throw AppError.unauthorized();

  let cursor: { createdAt: Date; id: string } | undefined;
  if (q.cursor) {
    const decoded = decodeCursor(q.cursor);
    if (!decoded) throw AppError.badRequest('Invalid cursor');
    cursor = decoded;
  }

  const { drops, nextCursor } = await listDrops({ viewerId: req.user?.id, status: q.status, mine: q.mine, tag: q.tag, limit: q.limit, cursor });
  const viewer = req.user && { id: req.user.id, isAdmin: req.user.isAdmin };
  res.json({
    drops: drops.map((d) => toDropDto(d, { viewer, detectivesExamining: dropViewerCount(d.id) })),
    nextCursor,
  });
});

dropsRouter.get('/drops/:id', validate({ params: idParams }), async (req, res) => {
  const drop = await getDrop(String(req.params.id), req.user?.id);
  const viewer = req.user && { id: req.user.id, isAdmin: req.user.isAdmin };
  res.json({ drop: toDropDto(drop, { viewer, detectivesExamining: dropViewerCount(drop.id) }) });
});

dropsRouter.post('/drops', requireAuth, validate({ body: createSchema }), async (req, res) => {
  const user = req.user!;
  const { drop, credits, activityId } = await createDrop(user, req.body as z.infer<typeof createSchema>);

  // Everyone learns about the new drop (answer hidden); the uploader gets their balance pushed.
  broadcast('new_drop', toDropDto(drop, { viewer: undefined }));
  notifyCredits(user.id, credits);
  void notifyScouts(activityId).catch(() => {});

  const dto = toDropDto(drop, { viewer: { id: user.id, isAdmin: user.isAdmin } });
  res.status(201).json({ drop: dto, user: await toSelfDto({ ...user, credits }) });
});
