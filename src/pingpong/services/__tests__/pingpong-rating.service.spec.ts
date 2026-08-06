import { Test, TestingModule } from '@nestjs/testing';
import { Glicko2 } from 'glicko2';
import { PingpongRatingService } from '../pingpong-rating.service';

/**
 * Ping-pong Glicko-2 engine.
 *
 * Runs its own constants (TAU 0.2, MIN_RD 75) and never imports anything from
 * src/rating — the Mario Kart engine is a separate implementation on purpose.
 * See rating-isolation.spec.ts for the other half of that guarantee.
 */
describe('PingpongRatingService', () => {
  let service: PingpongRatingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PingpongRatingService],
    }).compile();
    service = module.get(PingpongRatingService);
  });

  const even = () => ({
    playerA: { rating: 1500, rd: 200, vol: 0.06 },
    playerB: { rating: 1500, rd: 200, vol: 0.06 },
  });

  describe('full weight behaves like plain Glicko-2', () => {
    it('matches a hand-built Glicko-2 step at weight 1', () => {
      const { playerA, playerB } = even();

      const result = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });

      // Reproduce the same step with the library directly.
      const glicko = new Glicko2({
        tau: 0.2,
        rating: 1500,
        rd: 350,
        vol: 0.06,
      });
      const a = glicko.makePlayer(playerA.rating, playerA.rd, playerA.vol);
      const b = glicko.makePlayer(playerB.rating, playerB.rd, playerB.vol);
      glicko.updateRatings([[a, b, 1]]);

      expect(result.playerA.rating).toBeCloseTo(a.getRating(), 6);
      expect(result.playerA.rd).toBeCloseTo(a.getRd(), 6);
      expect(result.playerB.rating).toBeCloseTo(b.getRating(), 6);
    });

    it('moves the winner up and the loser down', () => {
      const { playerA, playerB } = even();
      const r = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });

      expect(r.playerA.rating).toBeGreaterThan(1500);
      expect(r.playerB.rating).toBeLessThan(1500);
    });
  });

  describe('weight interpolation', () => {
    it('leaves everything untouched at weight 0', () => {
      const { playerA, playerB } = even();
      const r = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 0,
      });

      // Zero weight means the match carries no information at all — not even
      // about uncertainty. The rd must not move either.
      expect(r.playerA).toEqual(playerA);
      expect(r.playerB).toEqual(playerB);
    });

    it('applies exactly half the delta at weight 0.5', () => {
      const { playerA, playerB } = even();
      const full = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });
      const half = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 0.5,
      });

      const fullDelta = full.playerA.rating - playerA.rating;
      const halfDelta = half.playerA.rating - playerA.rating;

      expect(halfDelta).toBeCloseTo(fullDelta / 2, 6);
    });
  });

  /**
   * The rating freeze is gone. It pinned both ratings whenever the gap
   * exceeded 250, which inverted the very precedents its comment cited:
   * USATT and the German TTR cap only the FAVOURITE's gain, and USATT awards
   * the upset winner 50 points — the largest value in its table — in the same
   * row where the favourite gets 0. Glicko-2's paper has no gap cutoff at all.
   *
   * In production it silenced 7 of 15 matches, including a 2-0 win across a
   * 442-point gap that Glicko puts at roughly 10% likelihood: the single most
   * informative result in the dataset, discarded.
   *
   * Anti-farming is still handled, upstream, by the per-ISO-week pairing
   * weight — which caps a pair's contribution without discarding the signal
   * from a genuine upset.
   */
  describe('large rating gaps still carry signal', () => {
    it('moves both ratings across a gap that used to freeze', () => {
      const playerA = { rating: 1900, rd: 80, vol: 0.06 };
      const playerB = { rating: 1500, rd: 120, vol: 0.06 };

      const r = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });

      expect(r.ratingFrozen).toBe(false);
      expect(r.playerA.rating).not.toBe(playerA.rating);
      expect(r.playerB.rating).not.toBe(playerB.rating);
      expect(r.playerA.rd).not.toBe(playerA.rd);
      expect(r.playerB.rd).not.toBe(playerB.rd);
    });

    it('moves the ratings whichever side is stronger', () => {
      const r = service.calculateMatchRating({
        playerA: { rating: 1500, rd: 80, vol: 0.06 },
        playerB: { rating: 1900, rd: 80, vol: 0.06 },
        winner: 'B',
        weight: 1,
      });

      expect(r.playerA.rating).toBeLessThan(1500);
      expect(r.playerB.rating).toBeGreaterThan(1900);
    });

    it('gives the favourite only a small gain for the expected win', () => {
      // Glicko-2's own diminishing returns do the anti-farming work here: a
      // win that was already near-certain teaches the system almost nothing.
      const r = service.calculateMatchRating({
        playerA: { rating: 1900, rd: 80, vol: 0.06 },
        playerB: { rating: 1500, rd: 80, vol: 0.06 },
        winner: 'A',
        weight: 1,
      });

      const gain = r.playerA.rating - 1900;
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThan(10);
    });

    /**
     * The regression test for the bug this removal fixes.
     *
     * 2026-08-05: Thibaud beat Charles 2-0 across a 442-point gap. Under the
     * freeze it changed nothing. It must now move the underdog up, and by
     * substantially more than an expected win moves the favourite.
     */
    it('rewards an underdog who wins across a 442 point gap', () => {
      const underdog = { rating: 1358, rd: 120, vol: 0.06 };
      const favourite = { rating: 1800, rd: 120, vol: 0.06 };

      const r = service.calculateMatchRating({
        playerA: underdog,
        playerB: favourite,
        winner: 'A',
        weight: 1,
      });

      expect(r.ratingFrozen).toBe(false);

      const underdogGain = r.playerA.rating - underdog.rating;
      expect(underdogGain).toBeGreaterThan(50);

      // And the favourite pays for it, symmetrically in direction.
      expect(r.playerB.rating).toBeLessThan(favourite.rating);
    });

    it('moves an upset far more than the expected result it displaced', () => {
      const underdog = { rating: 1358, rd: 120, vol: 0.06 };
      const favourite = { rating: 1800, rd: 120, vol: 0.06 };

      const upset = service.calculateMatchRating({
        playerA: underdog,
        playerB: favourite,
        winner: 'A',
        weight: 1,
      });
      const expected = service.calculateMatchRating({
        playerA: underdog,
        playerB: favourite,
        winner: 'B',
        weight: 1,
      });

      const upsetMove = Math.abs(upset.playerA.rating - underdog.rating);
      const expectedMove = Math.abs(expected.playerA.rating - underdog.rating);

      // A ~10% likely result is far more informative than a ~90% likely one.
      expect(upsetMove).toBeGreaterThan(expectedMove * 5);
    });

    it('never reports a frozen rating, whatever the gap', () => {
      for (const gap of [0, 100, 250, 251, 442, 900]) {
        const r = service.calculateMatchRating({
          playerA: { rating: 1500 + gap, rd: 80, vol: 0.06 },
          playerB: { rating: 1500, rd: 80, vol: 0.06 },
          winner: 'A',
          weight: 1,
        });
        expect(r.ratingFrozen).toBe(false);
      }
    });
  });

  /**
   * The two tuned constants, pinned by value.
   *
   * Both are this codebase's own choices rather than anything the `glicko2`
   * package or Glickman's paper imposes, so nothing else would fail if one
   * were quietly reverted — the ratings would just be subtly wrong. These
   * tests are the only thing standing between a one-character edit and a
   * leaderboard that overstates its own confidence.
   */
  describe('tuned constants', () => {
    it('floors the deviation at 75, not lower', () => {
      // MIN_RD is not part of the glicko2 package; it is added here. At 50 the
      // leaderboard asserts a ±100 confidence interval, which after 8 matches
      // in an 8-person pool is a claim the data cannot support. 75 is honest
      // about how little we actually know.
      //
      // Revisit if the league ever reaches ~10 games per player per rating
      // period, at which point a tighter floor becomes defensible.
      const r = service.calculateMatchRating({
        playerA: { rating: 1500, rd: 76, vol: 0.06 },
        playerB: { rating: 1500, rd: 76, vol: 0.06 },
        winner: 'A',
        weight: 1,
      });

      expect(r.playerA.rd).toBeGreaterThanOrEqual(75);
      expect(r.playerB.rd).toBeGreaterThanOrEqual(75);
    });

    it('clamps a deviation that starts below the floor', () => {
      const r = service.calculateMatchRating({
        playerA: { rating: 1500, rd: 20, vol: 0.06 },
        playerB: { rating: 1500, rd: 20, vol: 0.06 },
        winner: 'A',
        weight: 1,
      });

      expect(r.playerA.rd).toBe(75);
      expect(r.playerB.rd).toBe(75);
    });

    it('runs TAU at 0.2', () => {
      // Glickman's paper, verbatim: "If the application of Glicko-2 is
      // expected to involve extremely improbable collections of game
      // outcomes, then τ should be set to a small value, even as small as,
      // say, τ = 0.2." An 8-person office pool at roughly one match per
      // player per week is exactly that case — the volatility estimator is
      // being fit to single outcomes, and a larger τ lets it chase noise.
      //
      // Revisit at ~10 games per player per rating period.
      //
      // Read off the observable behaviour: the service must agree with a
      // library instance built at 0.2, and disagree with one at the old 0.35.
      const input = {
        playerA: { rating: 1500, rd: 200, vol: 0.06 },
        playerB: { rating: 1800, rd: 200, vol: 0.06 },
        winner: 'A' as const,
        weight: 1,
      };

      const result = service.calculateMatchRating(input);

      const atTau = (tau: number) => {
        const glicko = new Glicko2({ tau, rating: 1500, rd: 350, vol: 0.06 });
        const a = glicko.makePlayer(1500, 200, 0.06);
        const b = glicko.makePlayer(1800, 200, 0.06);
        glicko.updateRatings([[a, b, 1]]);
        return a.getVol();
      };

      expect(result.playerA.vol).toBeCloseTo(atTau(0.2), 9);
      expect(result.playerA.vol).not.toBeCloseTo(atTau(0.35), 9);
    });
  });

  describe('score independence', () => {
    it('has no way to receive a set score', () => {
      // The input type carries no score field. A 3-0 and a 3-2 that reach this
      // service are indistinguishable — margin of victory is deliberately out
      // of the rating, as every real federation does it.
      const { playerA, playerB } = even();
      const first = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });
      const second = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });

      expect(first).toEqual(second);
    });
  });

  describe('defaults', () => {
    it('starts new players at 1500 / 350 / 0.06', () => {
      expect(service.getDefaultRatings()).toEqual({
        rating: 1500,
        rd: 350,
        vol: 0.06,
      });
    });

    it('computes the conservative score as rating minus two deviations', () => {
      expect(service.calculateConservativeScore(1500, 50)).toBe(1400);
    });
  });
});
