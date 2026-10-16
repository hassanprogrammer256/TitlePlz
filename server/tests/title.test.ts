import { describe, expect, it } from 'vitest';
import { normalizeTitle, titlesMatch } from '../src/lib/title.js';

describe('normalizeTitle', () => {
  it('lowercases and collapses punctuation and whitespace', () => {
    expect(normalizeTitle('  Blade Runner: 2049!! ')).toBe('blade runner 2049');
    expect(normalizeTitle("Ocean's  Eleven")).toBe('ocean s eleven');
  });

  it('matches regardless of case and punctuation', () => {
    expect(titlesMatch('The Conversation', 'the-conversation')).toBe(true);
    expect(titlesMatch('Dark City', 'Dark Cities')).toBe(false);
  });

  it('never matches empty or symbol-only input', () => {
    expect(titlesMatch('', '')).toBe(false);
    expect(titlesMatch('!!!', '???')).toBe(false);
  });
});
