import { describe, expect, it } from 'vitest';
import { assignTiers } from '../src/lib/tiers.js';

const rows = (...points: number[]) => points.map((p, i) => ({ userId: `u${i}`, points: p }));
const tiers = (r: ReturnType<typeof assignTiers>) => r.map((x) => x.tier);
const ranks = (r: ReturnType<typeof assignTiers>) => r.map((x) => x.rank);

describe('assignTiers', () => {
  it('handles an empty season', () => {
    expect(assignTiers([], 10, 10)).toEqual([]);
  });

  it('uses competition ranks: ties share a rank and the next rank skips', () => {
    expect(ranks(assignTiers(rows(50, 40, 40, 30, 30, 30, 10), 10, 10))).toEqual([1, 2, 2, 4, 4, 4, 7]);
  });

  it('promotes everyone before demoting anyone when there are few participants', () => {
    expect(tiers(assignTiers(rows(5, 4, 3), 10, 10))).toEqual(['promoted', 'promoted', 'promoted']);
    expect(new Set(tiers(assignTiers(rows(...Array.from({ length: 10 }, (_, i) => 100 - i)), 10, 10)))).toEqual(new Set(['promoted']));
  });

  it('splits 25 participants into 10 promoted, 5 safe and 10 demoted', () => {
    const result = assignTiers(rows(...Array.from({ length: 25 }, (_, i) => 250 - i * 10)), 10, 10);
    expect(tiers(result).slice(0, 10).every((t) => t === 'promoted')).toBe(true);
    expect(tiers(result).slice(10, 15).every((t) => t === 'safe')).toBe(true);
    expect(tiers(result).slice(15).every((t) => t === 'demoted')).toBe(true);
  });

  it('demotes the tail of a small field after the promoted cut (12 participants)', () => {
    const result = assignTiers(rows(...Array.from({ length: 12 }, (_, i) => 120 - i)), 10, 10);
    expect(tiers(result)).toEqual([...Array(10).fill('promoted'), 'demoted', 'demoted']);
  });

  it('a tie at the promotion cut-off promotes everyone tied', () => {
    // ranks: 1..9 distinct, then three tied at rank 10
    const result = assignTiers(rows(90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 5, 5, 1), 10, 2);
    expect(ranks(result).slice(9, 12)).toEqual([10, 10, 10]);
    expect(tiers(result).slice(9, 12)).toEqual(['promoted', 'promoted', 'promoted']);
  });

  it('a tie across the demotion boundary resolves to the better tier', () => {
    // 15 participants, 3 demoted. Positions 12..14 are the last three; positions 11 and 12 are tied.
    const pts = [150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 40, 30, 20];
    const result = assignTiers(rows(...pts), 5, 3);
    expect(ranks(result).slice(11, 13)).toEqual([12, 12]);
    // index 12 is positionally "demoted" but tied with index 11 (safe), so it stays safe
    expect(tiers(result)[11]).toBe('safe');
    expect(tiers(result)[12]).toBe('safe');
    expect(tiers(result).slice(13)).toEqual(['demoted', 'demoted']);
  });

  it('everybody tied is promoted (rank 1)', () => {
    expect(new Set(tiers(assignTiers(rows(5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5), 10, 10)))).toEqual(new Set(['promoted']));
  });
});
