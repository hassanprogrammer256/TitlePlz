export type Tier = 'promoted' | 'safe' | 'demoted';

export type Ranked = { userId: string; points: number; rank: number; tier: Tier };

/**
 * Ranks participants and assigns season tiers.
 *
 * - Ranks are competition ranks: equal points share a rank (1, 2, 2, 4).
 * - promoted: rank <= `promoted` (so a tie at the cut-off promotes everyone tied).
 * - demoted: the last `demoted` participants by position, but never anyone who is tied with
 *   a safe participant. Ties always resolve to the better tier.
 * - With few participants everyone is promoted before anyone is demoted.
 *
 * `rows` must already be sorted by points, highest first.
 */
export function assignTiers(rows: { userId: string; points: number }[], promoted: number, demoted: number): Ranked[] {
  const ranks: number[] = [];
  rows.forEach((row, i) => {
    ranks.push(i > 0 && row.points === rows[i - 1]!.points ? ranks[i - 1]! : i + 1);
  });

  const firstDemotedIndex = Math.max(rows.length - demoted, 0);
  // Rank of the last participant who is positionally safe; anyone tied with them stays safe.
  const boundaryRank = firstDemotedIndex > 0 ? ranks[firstDemotedIndex - 1]! : -1;

  return rows.map((row, i) => {
    const rank = ranks[i]!;
    let tier: Tier = 'safe';
    if (rank <= promoted) tier = 'promoted';
    else if (i >= firstDemotedIndex && rank > boundaryRank) tier = 'demoted';
    return { userId: row.userId, points: row.points, rank, tier };
  });
}
