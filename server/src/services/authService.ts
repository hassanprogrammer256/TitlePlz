import { randomInt } from 'node:crypto';
import { getDummyHash, hashPassword, verifyPassword } from '../auth/password.js';
import { RULES } from '../config/rules.js';
import { prisma, withTx } from '../db/client.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { toUserDto } from '../dto/user.js';
import { AppError } from '../lib/errors.js';
import { applyCredit } from './creditService.js';
import { getUserStats } from './userStatsService.js';

export const usernameKeyOf = (username: string) => username.toLowerCase();

function makeAgentHash(username: string): string {
  const initials = username.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase().padEnd(2, 'X');
  const letter = String.fromCharCode(65 + randomInt(26));
  return `${initials}-${String(randomInt(1000, 10000))}-${letter}`;
}

export async function registerUser(input: { username: string; password: string; role: 'seeker' | 'detective' }): Promise<User> {
  const usernameKey = usernameKeyOf(input.username);
  if (await prisma.user.findUnique({ where: { usernameKey }, select: { id: true } })) {
    throw AppError.conflict('That username is already taken');
  }
  const passwordHash = await hashPassword(input.password);

  // agentHash is random; on the rare unique collision just draw again.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await withTx(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: input.username,
            usernameKey,
            handle: `@${input.username}`,
            passwordHash,
            role: input.role,
            agentHash: makeAgentHash(input.username),
          },
        });
        await applyCredit(tx, {
          userId: created.id,
          delta: RULES.SIGNUP_CREDITS,
          reason: 'signup',
          idempotencyKey: `signup:${created.id}`,
        });
        return tx.user.findUniqueOrThrow({ where: { id: created.id } });
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      // Lost a race for the username, or hit an agentHash collision.
      if (await prisma.user.findUnique({ where: { usernameKey }, select: { id: true } })) {
        throw AppError.conflict('That username is already taken');
      }
    }
  }
  throw new Error('Could not allocate a unique agent hash');
}

/** Same error for unknown user and wrong password; always burns one hash verification. */
export async function authenticate(username: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { usernameKey: usernameKeyOf(username) } });
  const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !ok) throw AppError.unauthorized('Invalid username or password');
  return user;
}

export async function toSelfDto(user: User) {
  const stats = (await getUserStats([user.id])).get(user.id);
  return toUserDto(user, { self: true, stats });
}
