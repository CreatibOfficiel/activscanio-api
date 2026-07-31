/**
 * Anti-farming: how much a match counts, based on how often this pair has
 * already played this ISO week.
 *
 * Beating the same opponent over and over is worth less each time. Glicko-2
 * already shrinks the gain as the rating gap widens, but not to zero — fifty
 * wins at +2 still add up. This caps it outright.
 *
 * @param matchesAlreadyPlayedThisWeek matches this pair played before this one
 */
export function computePairWeight(matchesAlreadyPlayedThisWeek: number): number {
  if (matchesAlreadyPlayedThisWeek < 3) return 1;
  if (matchesAlreadyPlayedThisWeek < 6) return 0.5;
  return 0;
}
