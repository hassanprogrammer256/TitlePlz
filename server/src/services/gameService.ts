import { RULES } from '../config/rules.js';
import { prisma, withTx, type Tx } from '../db/client.js';
import { dropInclude, effectiveStatus, type DropWithRelations } from '../dto/drop.js';
import { Prisma } from '../generated/prisma/client.js';
import { consensusStatus } from '../lib/consensus.js';
import { AppError } from '../lib/errors.js';
import { normalizeTitle } from '../lib/title.js';
import { applyCredit } from './creditService.js';
import { OPEN_STATUSES } from './dropService.js';

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Re-runs a whole transaction when two requests collide on a unique row (e.g. two people
 * submitting the same new candidate title at once). Safe because the failed attempt rolled back.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isUniqueViolation(err) || i >= attempts - 1) throw err;
    }
  }
}

type DropRow = { id: string; uploaderId: string; status: string; expiresAt: Date; correctTitleKey: string; bounty: number; dropNumber: string };

/** Loads a drop that must be open to play: exists, not solved/expired (deadline included), not the caller's own. */
async function loadPlayableDrop(tx: Tx, dropId: string, userId: string): Promise<DropRow> {
  const drop = await tx.drop.findUnique({
    where: { id: dropId },
    select: { id: true, uploaderId: true, status: true, expiresAt: true, correctTitleKey: true, bounty: true, dropNumber: true },
  });
  if (!drop) throw AppError.notFound('Drop not found');
  const status = effectiveStatus(drop, Date.now());
  if (status === 'solved' || status === 'expired') throw AppError.conflict('This drop is no longer accepting guesses or votes');
  if (drop.uploaderId === userId) throw AppError.forbidden('You cannot play your own drop');
  return drop;
}

/**
 * Puts the user's single vote for this drop on `candidateId`, moving it if they had
 * voted elsewhere. Keeps `Candidate.votes` equal to the number of voters.
 */
async function castVote(tx: Tx, userId: string, dropId: string, candidateId: string): Promise<boolean> {
  const existing = await tx.candidateVote.findMany({ where: { userId, candidate: { dropId } } });
  if (existing.some((v) => v.candidateId === candidateId)) return false;

  for (const old of existing) {
    await tx.candidateVote.delete({ where: { id: old.id } });
    await tx.candidate.update({ where: { id: old.candidateId }, data: { votes: { decrement: 1 } } });
  }
  await tx.candidateVote.create({ data: { candidateId, userId } });
  await tx.candidate.update({ where: { id: candidateId }, data: { votes: { increment: 1 } } });
  return true;
}

/** Recomputes tense/high consensus for a drop that is still open. */
async function refreshConsensus(tx: Tx, dropId: string) {
  const candidates = await tx.candidate.findMany({ where: { dropId }, select: { votes: true } });
  await tx.drop.updateMany({
    where: { id: dropId, status: { in: OPEN_STATUSES } },
    data: { status: consensusStatus(candidates.map((c) => c.votes)) },
  });
}

async function applyPoints(tx: Tx, userId: string, delta: number, standing: { solved: boolean; bounty: number }) {
  const user = await tx.user.update({ where: { id: userId }, data: { points: { increment: delta } }, select: { points: true } });
  if (user.points < 0) await tx.user.update({ where: { id: userId }, data: { points: 0 } });

  const season = await tx.season.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!season) return;
  const row = await tx.seasonStanding.upsert({
    where: { seasonId_userId: { seasonId: season.id, userId } },
    create: { seasonId: season.id, userId, points: Math.max(0, delta), solvedCount: standing.solved ? 1 : 0, bountyEarned: standing.solved ? standing.bounty : 0 },
    update: {
      points: { increment: delta },
      ...(standing.solved ? { solvedCount: { increment: 1 }, bountyEarned: { increment: standing.bounty } } : {}),
    },
  });
  if (row.points < 0) await tx.seasonStanding.update({ where: { seasonId_userId: { seasonId: season.id, userId } }, data: { points: 0 } });
}

export type GuessOutcome = {
  drop: DropWithRelations;
  isCorrect: boolean;
  credits: number;
  userHandle: string;
  activityId: string;
};

/**
 * One paid, final guess per user per drop. Everything happens in a single transaction:
 * stake -> trial -> candidate/vote -> (payout + solve) -> points -> activity.
 * Wrong-guess stakes are burned (roadmap Q2). If two people answer correctly at the same
 * instant, exactly one wins; the other transaction rolls back and keeps their credits.
 */
export async function submitGuess(user: { id: string; handle: string }, dropId: string, rawTitle: string): Promise<GuessOutcome> {
  const title = rawTitle.trim();
  const normalized = normalizeTitle(title);
  if (!normalized) throw AppError.badRequest('A title must contain letters or numbers');

  const result = await withRetry(() =>
    withTx(async (tx) => {
      const drop = await loadPlayableDrop(tx, dropId, user.id);
      if (await tx.trial.findUnique({ where: { dropId_userId: { dropId, userId: user.id } }, select: { id: true } })) {
        throw AppError.conflict('You already have a guess locked on this drop');
      }

      const isCorrect = normalized === drop.correctTitleKey;
      const reward = isCorrect ? RULES.GUESS_STAKE + drop.bounty : 0;
      const pointsDelta = isCorrect ? RULES.POINTS_CORRECT : RULES.POINTS_WRONG;

      await applyCredit(tx, {
        userId: user.id,
        delta: -RULES.GUESS_STAKE,
        reason: 'stake',
        idempotencyKey: `trial:${dropId}:${user.id}:stake`,
        ref: { type: 'drop', id: dropId },
      });
      await tx.trial.create({
        data: { dropId, userId: user.id, guessedTitle: title, isCorrect, stake: RULES.GUESS_STAKE, reward, pointsDelta },
      });

      // A guess is also that user's vote for the title.
      const candidate = await tx.candidate.upsert({
        where: { dropId_normalizedTitle: { dropId, normalizedTitle: normalized } },
        create: { dropId, title, normalizedTitle: normalized, votes: 0 },
        update: {},
      });
      await castVote(tx, user.id, dropId, candidate.id);

      if (isCorrect) {
        const solved = await tx.drop.updateMany({
          where: { id: dropId, status: { in: OPEN_STATUSES } },
          data: { status: 'solved', solvedById: user.id, solvedAt: new Date(), rewardClaimed: true },
        });
        if (solved.count !== 1) throw AppError.conflict('Someone else solved this drop first');
        await applyCredit(tx, {
          userId: user.id,
          delta: reward,
          reason: 'reward',
          idempotencyKey: `trial:${dropId}:${user.id}:reward`,
          ref: { type: 'drop', id: dropId },
        });
      } else {
        await refreshConsensus(tx, dropId);
      }

      await applyPoints(tx, user.id, pointsDelta, { solved: isCorrect, bounty: drop.bounty });
      const activity = await tx.activity.create({
        data: {
          actorId: user.id,
          type: isCorrect ? 'rewarded_clip' : 'answered_clip',
          dropId,
          message: `${isCorrect ? 'solved' : 'answered'} ${drop.dropNumber}`,
          amount: isCorrect ? drop.bounty : null,
          pointsDelta,
        },
      });

      const { credits } = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { credits: true } });
      return { isCorrect, credits, activityId: activity.id };
    }),
  );

  const drop = await prisma.drop.findUniqueOrThrow({ where: { id: dropId }, include: dropInclude(user.id) });
  return { drop, ...result, userHandle: user.handle };
}

/** Moves (or sets) the caller's vote. Idempotent for the candidate they already back. */
export async function voteForCandidate(userId: string, dropId: string, candidateId: string): Promise<DropWithRelations> {
  await withRetry(() =>
    withTx(async (tx) => {
      await loadPlayableDrop(tx, dropId, userId);
      const candidate = await tx.candidate.findUnique({ where: { id: candidateId }, select: { id: true, dropId: true } });
      if (!candidate || candidate.dropId !== dropId) throw AppError.notFound('Candidate not found on this drop');

      // A guess is a locked commitment: it cannot be moved by voting for another title.
      const trial = await tx.trial.findUnique({ where: { dropId_userId: { dropId, userId } }, select: { id: true } });
      const lockedVote = trial
        ? await tx.candidateVote.findFirst({ where: { userId, candidate: { dropId } }, select: { candidateId: true } })
        : null;
      if (lockedVote && lockedVote.candidateId !== candidateId) throw AppError.conflict('Your guess is locked on a different title');

      if (await castVote(tx, userId, dropId, candidateId)) await refreshConsensus(tx, dropId);
    }),
  );
  return prisma.drop.findUniqueOrThrow({ where: { id: dropId }, include: dropInclude(userId) });
}

const commentInclude = { author: true, agrees: true } satisfies Prisma.CommentInclude;
export type CommentWithRelations = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

export async function postComment(userId: string, dropId: string, content: string, timestampLabel: string): Promise<CommentWithRelations> {
  if (!(await prisma.drop.findUnique({ where: { id: dropId }, select: { id: true } }))) throw AppError.notFound('Drop not found');
  return prisma.comment.create({ data: { dropId, authorId: userId, content, timestampLabel }, include: commentInclude });
}

/** Toggles the caller's agreement. You cannot agree with your own comment. */
export async function toggleAgree(userId: string, dropId: string, commentId: string): Promise<CommentWithRelations> {
  await withRetry(() =>
    withTx(async (tx) => {
      const comment = await tx.comment.findUnique({ where: { id: commentId }, select: { id: true, dropId: true, authorId: true } });
      if (!comment || comment.dropId !== dropId) throw AppError.notFound('Comment not found on this drop');
      if (comment.authorId === userId) throw AppError.forbidden('You cannot agree with your own comment');

      const existing = await tx.commentAgree.findUnique({ where: { commentId_userId: { commentId, userId } } });
      if (existing) await tx.commentAgree.delete({ where: { commentId_userId: { commentId, userId } } });
      else await tx.commentAgree.create({ data: { commentId, userId } });
    }),
  );
  return prisma.comment.findUniqueOrThrow({ where: { id: commentId }, include: commentInclude });
}
