/**
 * Normalised Shannon entropy over a player's opponents.
 *
 * Answers "how spread out are this player's matches?" on a 0..1 scale:
 * 0 when every match was against the same person, 1 when they are evenly
 * split across all opponents faced.
 *
 * Used for ranking eligibility only — never for the rating itself. A player
 * who only ever plays one opponent still has a real rating; they just do not
 * appear in the ranked table.
 *
 * @param matchCountsPerOpponent how many matches against each distinct opponent
 */
export function shannonDiversity(matchCountsPerOpponent: number[]): number {
  const counts = matchCountsPerOpponent.filter((n) => n > 0);
  if (counts.length <= 1) return 0;

  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;

  const entropy = -counts.reduce((sum, n) => {
    const p = n / total;
    return sum + p * Math.log(p);
  }, 0);

  // Normalise by the maximum possible entropy for this number of opponents,
  // so the threshold means the same thing whatever the pool size.
  const maxEntropy = Math.log(counts.length);
  return maxEntropy === 0 ? 0 : entropy / maxEntropy;
}
