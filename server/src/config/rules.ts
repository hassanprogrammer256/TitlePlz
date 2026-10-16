/**
 * Game constants. Source of truth for the numbers is client/src/data/mockApi.ts;
 * keep them in sync with it until the client's mocks are retired (P8).
 */
export const RULES = {
  SIGNUP_CREDITS: 100,
  GUESS_STAKE: 20,
  DAILY_REFILL: 20,
  DAILY_REFILL_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  POINTS_CORRECT: 5,
  POINTS_WRONG: -3,
  FOLLOW_CAP: 5,
  MIN_VALIDITY_HOURS: 24,
  MAX_VALIDITY_HOURS: 168,
  MAX_CLIP_SECONDS: 600,
  SEASON_DAYS: 31,
  SEASON_PROMOTED: 10,
  SEASON_DEMOTED: 10,
  MIN_BOUNTY: 20,
  MAX_BOUNTY: 10_000,
  IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  VIDEO_MAX_BYTES: 100 * 1024 * 1024,
  MAX_UNATTACHED_UPLOADS_PER_DAY: 20,
  MAX_TAGS: 10,
} as const;

/** Purchasable credit packs. The server decides the amount; the client's `amount` is only cross-checked. */
export const CREDIT_PACKAGES = { tier_20: 20, tier_50: 50, tier_100: 100 } as const;
export type CreditPackageId = keyof typeof CREDIT_PACKAGES;

/** Roles a user may pick when registering. `curator` is admin-granted only. */
export const SELF_SELECTABLE_ROLES = ['seeker', 'detective'] as const;
export const ALL_ROLES = ['seeker', 'detective', 'curator'] as const;
