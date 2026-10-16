import { describe, expect, it } from 'vitest';
import { toDropDto, toCandidateDtos, type DropWithRelations } from '../src/dto/drop.js';
import { roleTitle, toUserDto } from '../src/dto/user.js';
import { formatRemaining, timeAgo } from '../src/lib/time.js';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo);

const user = (over: Record<string, unknown> = {}) =>
  ({
    id: 'u1', username: 'NeonVagrant', usernameKey: 'neonvagrant', handle: '@NeonVagrant', passwordHash: 'HASH',
    role: 'detective', isAdmin: false, avatarUrl: null, agentHash: 'NV-1', credits: 250, points: 10,
    lastDailyRefillAt: at(1000), createdAt: at(0), updatedAt: at(0), ...over,
  }) as never;

function drop(over: Partial<DropWithRelations> = {}): DropWithRelations {
  const uploader = user({ id: 'up', username: 'Up', handle: '@Up', role: 'seeker' });
  return {
    id: 'd1', dropNumber: 'DROP #1', uploaderId: 'up', mediaType: 'photo', clipDurationSeconds: null,
    imageUrl: '/x.jpg', imageKey: null, videoUrl: null, videoKey: null, releaseYear: 1999,
    correctTitle: 'Secret Movie', correctTitleKey: 'secret movie', bounty: 100, validityHours: 24,
    expiresAt: new Date(NOW + 3_600_000), status: 'unsolved', solvedById: null, solvedAt: null,
    rewardClaimed: false, refundedAt: null, timecode: '00:00:00:00', source: 'User Upload',
    aspectRatioLabel: '', spectralLabel: '', fpsLabel: '', audioStemLabel: '', audioDuration: 0,
    targetPropNote: null, createdAt: at(38 * 60_000), updatedAt: at(0),
    uploader, solvedBy: null, tags: [{ dropId: 'd1', tagId: 't', tag: { id: 't', name: 'neonoir' } }],
    candidates: [], comments: [], trials: [],
    ...over,
  } as DropWithRelations;
}

describe('time helpers', () => {
  it('timeAgo buckets', () => {
    expect(timeAgo(at(10_000), NOW)).toBe('just now');
    expect(timeAgo(at(4 * 60_000), NOW)).toBe('4m ago');
    expect(timeAgo(at(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(timeAgo(at(50 * 3_600_000), NOW)).toBe('2d ago');
    expect(timeAgo(new Date(NOW + 5000), NOW)).toBe('just now');
  });

  it('formatRemaining pads, allows >99h, and floors at zero', () => {
    expect(formatRemaining(NOW + 3_661_000, NOW)).toBe('01:01:01');
    expect(formatRemaining(NOW + 168 * 3_600_000, NOW)).toBe('168:00:00');
    expect(formatRemaining(NOW - 1000, NOW)).toBe('00:00:00');
  });
});

describe('toUserDto', () => {
  it('exposes private fields only to the user themself and never the hash', () => {
    const self = toUserDto(user(), { self: true, stats: { rank: 3, following: ['@A'] } });
    expect(self).toMatchObject({ credits: 250, following: ['@A'], rank: 3, roleTitle: 'Rank #3 • Detective' });
    expect(self.lastDailyRefillAt).toBeGreaterThan(0);

    const other = toUserDto(user(), { self: false, stats: { following: ['@A'] } });
    expect(other).toMatchObject({ credits: 0, lastDailyRefillAt: 0, following: [] });
    expect(JSON.stringify(self)).not.toContain('HASH');
    expect(JSON.stringify(other)).not.toContain('passwordHash');
  });

  it('gives users without an avatar the default one, never an empty string', () => {
    expect(toUserDto(user(), { self: true }).avatar).toBe('/default-avatar.jpg');
    expect(toUserDto(user({ avatarUrl: 'https://img.test/a.png' }), { self: false }).avatar).toBe('https://img.test/a.png');
  });

  it('flags administrators only on their own profile', () => {
    const admin = user({ isAdmin: true });
    expect(toUserDto(admin, { self: true }).isAdmin).toBe(true);
    expect(toUserDto(admin, { self: false }).isAdmin).toBeUndefined();
    expect(toUserDto(user(), { self: true }).isAdmin).toBeUndefined();
  });

  it('roleTitle handles unranked users', () => {
    expect(roleTitle('curator', 0)).toBe('Unranked • MovieKing');
  });
});

describe('toCandidateDtos', () => {
  const c = (id: string, votes: number, t = 0) => ({ id, title: id, votes, createdAt: new Date(t), year: null, director: null, cinematographer: null, imdbId: null, notes: null }) as never;

  it('computes percentages, sorts by votes and flags a single leader', () => {
    const out = toCandidateDtos([c('b', 23), c('a', 68), c('z', 9)]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'z']);
    expect(out.map((x) => x.percentage)).toEqual([68, 23, 9]);
    expect(out.filter((x) => x.isLeader).map((x) => x.id)).toEqual(['a']);
  });

  it('has no leader and 0% when nobody voted', () => {
    const out = toCandidateDtos([c('a', 0), c('b', 0)]);
    expect(out.every((x) => x.percentage === 0 && !x.isLeader)).toBe(true);
  });
});

describe('toDropDto answer visibility', () => {
  const anon = undefined;
  const stranger = { id: 'other', isAdmin: false };

  it('hides the answer from anonymous viewers and strangers while open', () => {
    expect(toDropDto(drop(), { viewer: anon, now: NOW }).correctTitle).toBe('');
    expect(toDropDto(drop(), { viewer: stranger, now: NOW }).correctTitle).toBe('');
    expect(JSON.stringify(toDropDto(drop(), { viewer: stranger, now: NOW }))).not.toContain('Secret Movie');
  });

  it('shows the answer to the uploader and to admins', () => {
    expect(toDropDto(drop(), { viewer: { id: 'up', isAdmin: false }, now: NOW }).correctTitle).toBe('Secret Movie');
    expect(toDropDto(drop(), { viewer: { id: 'adm', isAdmin: true }, now: NOW }).correctTitle).toBe('Secret Movie');
  });

  it('reveals the answer once solved', () => {
    const solved = drop({ status: 'solved', solvedBy: user({ handle: '@Winner' }), solvedAt: at(1000) });
    const dto = toDropDto(solved, { viewer: stranger, now: NOW });
    expect(dto.correctTitle).toBe('Secret Movie');
    expect(dto.status).toBe('solved');
    expect(dto.timeRemaining).toBe('Resolved by @Winner');
  });

  it('treats an open drop past its deadline as expired and reveals it', () => {
    const late = drop({ expiresAt: new Date(NOW - 1) });
    const dto = toDropDto(late, { viewer: stranger, now: NOW });
    expect(dto.status).toBe('expired');
    expect(dto.correctTitle).toBe('Secret Movie');
    expect(dto.lockTimeRemaining).toBe('00:00:00 (ARCHIVED)');
  });

  it('only returns the viewer\'s own trial', () => {
    const trial = (userId: string) =>
      ({ userId, user: user({ id: userId, handle: `@${userId}` }), guessedTitle: 'X', isCorrect: false, stake: 20, reward: 0, pointsDelta: -3, createdAt: at(0) }) as never;
    const d = drop({ trials: [trial('me'), trial('them')] });
    expect(Object.keys(toDropDto(d, { viewer: { id: 'me', isAdmin: false }, now: NOW }).userTrials)).toEqual(['me']);
    expect(toDropDto(d, { viewer: anon, now: NOW }).userTrials).toEqual({});
  });

  it('formats tags, timings and vote totals', () => {
    const dto = toDropDto(
      drop({ candidates: [{ id: 'c', title: 'A', votes: 3, createdAt: at(0), year: null, director: null, cinematographer: null, imdbId: null, notes: null } as never] }),
      { now: NOW },
    );
    expect(dto.tags).toEqual(['#neonoir']);
    expect(dto.uploadedAgo).toBe('38m ago');
    expect(dto.timeRemaining).toBe('01:00:00');
    expect(dto.totalGuessesCast).toBe(3);
    expect(dto.validatedByText).toBe('3 trial guesses logged');
  });
});
