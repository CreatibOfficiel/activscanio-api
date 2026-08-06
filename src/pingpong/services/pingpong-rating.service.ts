import { Injectable } from '@nestjs/common';
import { Glicko2 } from 'glicko2';

/**
 * Glicko-2 for ping-pong.
 *
 * Deliberately a separate implementation from src/rating (Mario Kart), with
 * its own constants. The two scales are never mixed: a 1700 at the table and
 * a 1700 on the track measure different things, over different populations.
 *
 * Two parameters differ from Mario Kart, and both are on purpose. Both are
 * tuned for the size of this league — eight people playing about one match
 * each per week — and both should be revisited if it ever reaches roughly ten
 * games per player per rating period.
 */
@Injectable()
export class PingpongRatingService {
  /**
   * Volatility constraint. 0.2, the smallest value Glickman names.
   *
   * From the Glicko-2 paper, verbatim: "If the application of Glicko-2 is
   * expected to involve extremely improbable collections of game outcomes,
   * then τ should be set to a small value, even as small as, say, τ = 0.2."
   *
   * That is this league exactly. At roughly one match per player per week
   * across eight people, the volatility estimator is being fit to single
   * outcomes rather than to a period's worth of them, and a larger τ lets it
   * chase noise: one surprising Tuesday reads as a player whose true strength
   * is swinging. Was 0.35, on the reasoning that table tennis is more
   * deterministic than a kart race — true, but it argues for trusting the
   * RATING more, not for letting the VOLATILITY move more.
   *
   * Revisit at ~10 games per player per rating period.
   */
  private readonly TAU = 0.2;
  private readonly DEFAULT_RATING = 1500;
  private readonly DEFAULT_RD = 350;
  private readonly DEFAULT_VOL = 0.06;

  /**
   * Deviation floor. Not part of the `glicko2` package — this codebase adds it.
   *
   * A deviation of 50 asserts a ±100 confidence interval on a player's true
   * strength. After eight matches inside an eight-person pool, that is a claim
   * the data does not support: nobody here has played enough, against enough
   * different people, to be known that precisely. 75 is the honest floor.
   *
   * Revisit at ~10 games per player per rating period.
   */
  private readonly MIN_RD = 75;

  /**
   * There is deliberately no rating freeze here.
   *
   * An earlier version pinned BOTH ratings whenever the gap exceeded 250,
   * citing USATT (238) and the German TTR (224). Both citations were checked
   * against the primary sources and both say the opposite: they cap only the
   * FAVOURITE's gain. USATT's own table awards the upset winner 50 points —
   * the largest value anywhere in it — in the very row where the favourite
   * gets 0. Freezing symmetrically inverted both precedents. The TTR's 224
   * turned out not to be a rule at all, but an integer-rounding artifact that
   * disappears at a different K. Glicko-2's paper contains no gap cutoff of
   * any kind.
   *
   * The cost was not theoretical: 7 of 15 recorded matches were silenced,
   * including a 2-0 win across a 442-point gap — a result Glicko puts at
   * roughly 10% likelihood, and so the single most informative match in the
   * dataset. It moved nothing.
   *
   * The anti-farming intent the freeze was reaching for is already served,
   * and served better, by the per-ISO-week pairing weight upstream (see
   * utils/pairing-weight.ts): it caps how much one pair can contribute in a
   * week without discarding the signal from a genuine upset.
   */
  calculateMatchRating(input: PingpongRatingInput): PingpongRatingOutput {
    const { playerA, playerB, winner, weight } = input;

    // A zero-weight match carries no information at all — not even about
    // uncertainty. Return untouched rather than interpolating to the same
    // values, so callers can rely on reference equality.
    if (weight === 0) {
      return { playerA, playerB, ratingFrozen: false };
    }

    const glicko = new Glicko2({
      tau: this.TAU,
      rating: this.DEFAULT_RATING,
      rd: this.DEFAULT_RD,
      vol: this.DEFAULT_VOL,
    });

    const a = glicko.makePlayer(playerA.rating, playerA.rd, playerA.vol);
    const b = glicko.makePlayer(playerB.rating, playerB.rd, playerB.vol);

    glicko.updateRatings([[a, b, winner === 'A' ? 1 : 0]]);

    return {
      playerA: this.blend(
        playerA,
        { rating: a.getRating(), rd: a.getRd(), vol: a.getVol() },
        weight,
      ),
      playerB: this.blend(
        playerB,
        { rating: b.getRating(), rd: b.getRd(), vol: b.getVol() },
        weight,
      ),
      // Always false now that the freeze is gone. Kept on the output — and on
      // the match column — because rows written under the old rule are a
      // record of what actually happened, and dropping it destroys that.
      ratingFrozen: false,
    };
  }

  getDefaultRatings(): PingpongRating {
    return {
      rating: this.DEFAULT_RATING,
      rd: this.DEFAULT_RD,
      vol: this.DEFAULT_VOL,
    };
  }

  /** Rating minus two deviations — what the leaderboard sorts on. */
  calculateConservativeScore(rating: number, rd: number): number {
    return Math.max(0, rating - 2 * rd);
  }

  /**
   * Interpolate between the state before the match and the plain Glicko-2
   * result, weighted by how much this match should count.
   *
   * The glicko2 npm package exposes no way to weight a result, so rather than
   * reimplementing the weighted update (~120 lines of delicate numerical code,
   * including the iterative volatility step), we let the library take a full
   * step and scale the move. At weight 1 this is exact Glicko-2; at weight 0
   * nothing happens; in between it is monotonic and continuous.
   */
  private blend(
    before: PingpongRating,
    after: PingpongRating,
    weight: number,
  ): PingpongRating {
    const lerp = (from: number, to: number) => from + weight * (to - from);

    return {
      rating: lerp(before.rating, after.rating),
      rd: Math.max(this.MIN_RD, lerp(before.rd, after.rd)),
      vol: lerp(before.vol, after.vol),
    };
  }
}

export interface PingpongRating {
  rating: number;
  rd: number;
  vol: number;
}

export interface PingpongRatingInput {
  playerA: PingpongRating;
  playerB: PingpongRating;
  /** Who took the match. Set scores never reach this service. */
  winner: 'A' | 'B';
  /** 0, 0.5 or 1 — computed upstream by the anti-farming pairing rule. */
  weight: number;
}

export interface PingpongRatingOutput {
  playerA: PingpongRating;
  playerB: PingpongRating;
  /**
   * Always false. The rating freeze was removed; the field stays so the match
   * column keeps a single writer, and so rows recorded under the old rule
   * remain distinguishable from rows written since.
   */
  ratingFrozen: boolean;
}
