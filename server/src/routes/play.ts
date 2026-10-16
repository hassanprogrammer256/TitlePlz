import { Router } from 'express';
import { z } from 'zod';
import { toCandidateDtos, toCommentDto, toDropDto } from '../dto/drop.js';
import { requireAuth } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { dropViewerCount, emitToDrop } from '../realtime/io.js';
import { toSelfDto } from '../services/authService.js';
import { notifyCredits } from '../services/creditService.js';
import { postComment, submitGuess, toggleAgree, voteForCandidate } from '../services/gameService.js';
import { scheduleLeaderboardBroadcast } from '../services/leaderboardService.js';
import { notifyScouts } from '../services/scoutService.js';
import type { DropWithRelations } from '../dto/drop.js';

const idParams = z.object({ id: z.string().min(1).max(64) });
const commentParams = idParams.extend({ commentId: z.string().min(1).max(64) });

const guessSchema = z.object({ title: z.string().trim().min(1, 'is required').max(200) });
const voteSchema = z.object({ candidateId: z.string().min(1).max(64) });
const commentSchema = z.object({
  content: z.string().trim().min(1, 'is required').max(1000),
  // "mm:ss" or "hh:mm:ss[:ff]" position in the clip the comment refers to.
  timestamp: z
    .string()
    .trim()
    .regex(/^\d{1,2}(:\d{2}){1,3}$/, 'must look like 01:12')
    .optional(),
});

const guessLimiter = createLimiter({ windowMs: 60_000, limit: 30, message: 'Too many guesses, slow down' });
const voteLimiter = createLimiter({ windowMs: 60_000, limit: 60, message: 'Too many votes, slow down' });
const commentLimiter = createLimiter({ windowMs: 60_000, limit: 30, message: 'Too many comments, slow down' });

/** What every watcher of a drop needs after the crowd state changes. Contains no answer. */
function consensusPayload(drop: DropWithRelations) {
  const dto = toDropDto(drop, { viewer: undefined });
  return { dropId: drop.id, status: dto.status, totalGuessesCast: dto.totalGuessesCast, candidates: toCandidateDtos(drop.candidates) };
}

export const playRouter = Router();
playRouter.use('/drops/:id', requireAuth);

playRouter.post('/drops/:id/guess', guessLimiter, validate({ params: idParams, body: guessSchema }), async (req, res) => {
  const user = req.user!;
  const { title } = req.body as z.infer<typeof guessSchema>;
  const outcome = await submitGuess(user, String(req.params.id), title);

  notifyCredits(user.id, outcome.credits);
  emitToDrop(outcome.drop.id, 'guess_result', {
    isCorrect: outcome.isCorrect,
    userHandle: outcome.userHandle,
    ...consensusPayload(outcome.drop),
  });
  emitToDrop(outcome.drop.id, 'consensus_update', consensusPayload(outcome.drop));
  void notifyScouts(outcome.activityId).catch(() => {});
  scheduleLeaderboardBroadcast();

  const dto = toDropDto(outcome.drop, { viewer: { id: user.id, isAdmin: user.isAdmin }, detectivesExamining: dropViewerCount(outcome.drop.id) });
  res.json({ drop: dto, isCorrect: outcome.isCorrect, user: await toSelfDto({ ...user, credits: outcome.credits }) });
});

playRouter.post('/drops/:id/vote', voteLimiter, validate({ params: idParams, body: voteSchema }), async (req, res) => {
  const user = req.user!;
  const { candidateId } = req.body as z.infer<typeof voteSchema>;
  const drop = await voteForCandidate(user.id, String(req.params.id), candidateId);

  emitToDrop(drop.id, 'consensus_update', consensusPayload(drop));
  res.json({ drop: toDropDto(drop, { viewer: { id: user.id, isAdmin: user.isAdmin }, detectivesExamining: dropViewerCount(drop.id) }) });
});

playRouter.post('/drops/:id/comment', commentLimiter, validate({ params: idParams, body: commentSchema }), async (req, res) => {
  const user = req.user!;
  const { content, timestamp } = req.body as z.infer<typeof commentSchema>;
  const comment = await postComment(user.id, String(req.params.id), content, timestamp ?? '00:00');

  emitToDrop(String(req.params.id), 'new_comment', { dropId: String(req.params.id), comment: toCommentDto(comment, undefined, Date.now()) });
  res.status(201).json({ comment: toCommentDto(comment, { id: user.id, isAdmin: user.isAdmin }, Date.now()) });
});

playRouter.post('/drops/:id/comments/:commentId/agree', voteLimiter, validate({ params: commentParams }), async (req, res) => {
  const user = req.user!;
  const comment = await toggleAgree(user.id, String(req.params.id), String(req.params.commentId));
  res.json({ comment: toCommentDto(comment, { id: user.id, isAdmin: user.isAdmin }, Date.now()) });
});
