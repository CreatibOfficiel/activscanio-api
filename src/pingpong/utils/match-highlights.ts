import { SetScore } from './pingpong-classification';

/** Rating gap above which beating someone counts as an upset. */
export const UPSET_GAP = 150;

export interface MatchHighlightsInput {
  /** Set scores from player A's point of view. */
  sets: SetScore[];
  /**
   * Whose point of view to report from — NOT necessarily who won the match.
   *
   * Two achievements are claimed by the losing player (conceding a 0-11 set),
   * so callers evaluate the same match twice, once per side, by flipping this.
   * Fields describing a feat of winning (`cameBack`, `isHeist`, `isUpset`) are
   * only meaningful when this side actually won; the caller decides.
   */
  winner: 'A' | 'B';
  /** Rating held by the side named above, before the match. */
  selfRatingBefore?: number;
  /** Rating held by the other side, before the match. */
  opponentRatingBefore?: number;
}

export interface MatchHighlights {
  /** The winner took a set 11-0. */
  dealtShutoutSet: boolean;
  /** The winner dropped a set 0-11 along the way. */
  concededShutoutSet: boolean;
  /** The winner lost the opening set and still took the match. */
  cameBack: boolean;
  /** The winner took at least one set past 10-10. */
  wonDeuceSet: boolean;
  deuceSetsWon: number;
  /** Came back from a dropped first set AND sealed it with two deuce sets. */
  isHeist: boolean;
  /** How far above the winner the loser was rated. Zero if they were below. */
  ratingGapBeaten: number;
  isUpset: boolean;
}

/**
 * Read a single match for the things running totals cannot see.
 *
 * A player can have a thousand wins and never once have taken a set 11-0.
 * These shapes only exist inside one match, so they are detected once, at
 * recording time, rather than recomputed from aggregates.
 *
 * Everything is expressed from the WINNER's point of view, whichever side of
 * the table they were on.
 */
export function detectMatchHighlights(
  input: MatchHighlightsInput,
): MatchHighlights {
  const { sets, winner, selfRatingBefore, opponentRatingBefore } = input;

  // Normalise to the winner's perspective so the rules read the same whether
  // they played as A or B.
  const fromWinner = sets.map((set) =>
    winner === 'A' ? { won: set.a, lost: set.b } : { won: set.b, lost: set.a },
  );

  const dealtShutoutSet = fromWinner.some((s) => s.won === 11 && s.lost === 0);
  const concededShutoutSet = fromWinner.some(
    (s) => s.lost === 11 && s.won === 0,
  );

  const firstSet = fromWinner[0];
  const cameBack = firstSet ? firstSet.lost > firstSet.won : false;

  // A deuce set is one that went past 10-10, so the winning score is 12+.
  const deuceSetsWon = fromWinner.filter(
    (s) => s.won > s.lost && s.won >= 12,
  ).length;

  const ratingGapBeaten =
    selfRatingBefore !== undefined && opponentRatingBefore !== undefined
      ? Math.max(0, opponentRatingBefore - selfRatingBefore)
      : 0;

  return {
    dealtShutoutSet,
    concededShutoutSet,
    cameBack,
    wonDeuceSet: deuceSetsWon > 0,
    deuceSetsWon,
    // Deliberately narrow: dropped the opener, then took two sets that each
    // went the distance. On a small league this may go unclaimed for months,
    // which is the point of a legendary.
    isHeist: cameBack && deuceSetsWon >= 2,
    ratingGapBeaten,
    isUpset: ratingGapBeaten >= UPSET_GAP,
  };
}
