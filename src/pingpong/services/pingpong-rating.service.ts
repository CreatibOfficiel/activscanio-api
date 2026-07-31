import { Injectable } from '@nestjs/common';
import { Glicko2 } from 'glicko2';

/**
 * Glicko-2 for ping-pong.
 *
 * Deliberately a separate implementation from src/rating (Mario Kart), with
 * its own constants. The two scales are never mixed: a 1700 at the table and
 * a 1700 on the track measure different things, over different populations.
 *
 * Two parameters differ from Mario Kart, and both are on purpose:
 * - TAU 0.35 instead of 0.5. Table tennis is far more deterministic than a
 *   kart race with blue shells, so a surprising result is more informative
 *   and the system should trust it more.
 * - MIN_RD 50 instead of 30. Office players improve fast over a few months;
 *   a floor that is too low freezes a rating that should still be moving.
 */
@Injectable()
export class PingpongRatingService {
  private readonly TAU = 0.35;
  private readonly DEFAULT_RATING = 1500;
  private readonly DEFAULT_RD = 350;
  private readonly DEFAULT_VOL = 0.06;
  private readonly MIN_RD = 50;

  /**
   * Rating gap beyond which a match carries no rating signal.
   *
   * Mirrors what real federations do: USATT stops awarding points past 238,
   * the German TTR past 224. Without it, beating a much weaker opponent fifty
   * times still adds up, because Glicko-2's diminishing returns never quite
   * reach zero.
   */
  private readonly FREEZE_GAP = 250;

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

    const ratingFrozen =
      Math.abs(playerA.rating - playerB.rating) > this.FREEZE_GAP;

    return {
      playerA: this.blend(
        playerA,
        { rating: a.getRating(), rd: a.getRd(), vol: a.getVol() },
        weight,
        ratingFrozen,
      ),
      playerB: this.blend(
        playerB,
        { rating: b.getRating(), rd: b.getRd(), vol: b.getVol() },
        weight,
        ratingFrozen,
      ),
      ratingFrozen,
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
   *
   * When the rating is frozen, only the deviation and volatility move: the
   * match said nothing about relative strength, but it did say something about
   * how confident we are.
   */
  private blend(
    before: PingpongRating,
    after: PingpongRating,
    weight: number,
    ratingFrozen: boolean,
  ): PingpongRating {
    const lerp = (from: number, to: number) => from + weight * (to - from);

    return {
      rating: ratingFrozen ? before.rating : lerp(before.rating, after.rating),
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
  /** True when the rating gap exceeded FREEZE_GAP and ratings were pinned. */
  ratingFrozen: boolean;
}
