import { describe, expect, it } from 'vitest';
import { consensusStatus } from '../src/lib/consensus.js';

describe('consensusStatus', () => {
  it('stays unsolved until at least 3 votes exist', () => {
    expect(consensusStatus([])).toBe('unsolved');
    expect(consensusStatus([0, 0])).toBe('unsolved');
    expect(consensusStatus([1])).toBe('unsolved');
    expect(consensusStatus([1, 1])).toBe('unsolved'); // a 1-1 split is not yet a "tense" crowd
  });

  it('is tense when the top two are within 15 points', () => {
    expect(consensusStatus([2, 2])).toBe('tense_consensus');
    expect(consensusStatus([5, 4, 1])).toBe('tense_consensus'); // 50% vs 40%
  });

  it('is high with a 60% leader on at least 10 votes', () => {
    expect(consensusStatus([11, 5, 2])).toBe('high_consensus'); // 18 votes, leader 61%
    expect(consensusStatus([6, 4])).toBe('high_consensus'); // exactly 60% of exactly 10
    expect(consensusStatus([10])).toBe('high_consensus'); // 100% of 10
  });

  it('is unsolved when the leader is clear but the crowd is too small or not dominant enough', () => {
    expect(consensusStatus([7, 2])).toBe('unsolved'); // 78% but only 9 votes, gap 55
    expect(consensusStatus([3, 0])).toBe('unsolved'); // single candidate, 3 votes
    expect(consensusStatus([9])).toBe('unsolved'); // 100% but 9 votes
    expect(consensusStatus([59, 41])).toBe('unsolved'); // 59% is below 60%, gap 18
  });

  it('tense boundary is inclusive at a 15-point gap', () => {
    expect(consensusStatus([57, 43])).toBe('tense_consensus'); // gap 14
    expect(consensusStatus([57, 42, 1])).toBe('tense_consensus'); // gap 15
    expect(consensusStatus([58, 42])).toBe('unsolved'); // gap 16
  });

  it('checks high before tense and ignores input order', () => {
    expect(consensusStatus([60, 40])).toBe('high_consensus'); // would also be a 20-pt gap, never tense
    expect(consensusStatus([1, 9, 5])).toBe(consensusStatus([9, 5, 1]));
  });
});
