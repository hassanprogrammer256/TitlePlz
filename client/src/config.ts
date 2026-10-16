import type { User } from './types';

/**
 * Offline demo mode. When `VITE_USE_MOCKS=true` the app runs entirely on the client-side
 * simulations in data/mockApi.ts + data/dummyData.ts and never calls the server. Otherwise
 * (the default) every action goes to the real `/api/*` backend, and failures show as errors
 * instead of silently falling back to fake data.
 */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

/**
 * The quick-switch roster impersonates users via POST /api/auth/switch-user, which the
 * server only mounts in development. It is also how the mock mode demos different roles.
 */
export const CAN_SWITCH_USERS = USE_MOCKS || import.meta.env.DEV;

/** Server admins (`isAdmin`) may start a new season. Mock users are admins when they are curators. */
export const canAdministerSeason = (user: Pick<User, 'isAdmin' | 'role'> | null | undefined): boolean =>
  Boolean(user && (user.isAdmin ?? user.role === 'curator'));
