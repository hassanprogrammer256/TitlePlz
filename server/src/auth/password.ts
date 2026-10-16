import argon2 from 'argon2';
import { config } from '../config/env.js';

export const PASSWORD_MIN = 8;
// Upper bound stops absurdly long inputs from being used to burn CPU in the hasher.
export const PASSWORD_MAX = 128;

// Tests create hundreds of accounts; the cheap parameters keep the suite fast. Never used outside NODE_ENV=test.
const TEST_COST = { memoryCost: 1024, timeCost: 1, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, ...(config.NODE_ENV === 'test' ? TEST_COST : {}) });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false; // malformed hash etc.
  }
}

// Verified against when the username doesn't exist, so "unknown user" and
// "wrong password" take about the same time (no username enumeration by timing).
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('timing-equalizer-not-a-real-password');
  return dummyHash;
}
