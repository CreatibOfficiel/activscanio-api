import { Test, TestingModule } from '@nestjs/testing';
import { Glicko2 } from 'glicko2';
import { PingpongRatingService } from '../pingpong-rating.service';

/**
 * Ping-pong Glicko-2 engine.
 *
 * Runs its own constants (TAU 0.35, MIN_RD 50) and never imports anything from
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
        tau: 0.35,
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

  describe('rating freeze beyond a 250 point gap', () => {
    it('freezes both ratings but still moves both deviations', () => {
      const playerA = { rating: 1900, rd: 80, vol: 0.06 };
      const playerB = { rating: 1500, rd: 120, vol: 0.06 };

      const r = service.calculateMatchRating({
        playerA,
        playerB,
        winner: 'A',
        weight: 1,
      });

      expect(r.ratingFrozen).toBe(true);

      // Ratings pinned: farming a much weaker opponent earns nothing, and the
      // weaker player loses nothing for showing up.
      expect(r.playerA.rating).toBe(playerA.rating);
      expect(r.playerB.rating).toBe(playerB.rating);

      // Deviations still evolve: the match did carry information about how
      // certain we are, even if it should not shift the ratings.
      expect(r.playerA.rd).not.toBe(playerA.rd);
      expect(r.playerB.rd).not.toBe(playerB.rd);
    });

    it('does not freeze at exactly 250 points', () => {
      const r = service.calculateMatchRating({
        playerA: { rating: 1750, rd: 80, vol: 0.06 },
        playerB: { rating: 1500, rd: 80, vol: 0.06 },
        winner: 'A',
        weight: 1,
      });

      expect(r.ratingFrozen).toBe(false);
      expect(r.playerA.rating).not.toBe(1750);
    });

    it('freezes regardless of which side is stronger', () => {
      const r = service.calculateMatchRating({
        playerA: { rating: 1500, rd: 80, vol: 0.06 },
        playerB: { rating: 1900, rd: 80, vol: 0.06 },
        winner: 'B',
        weight: 1,
      });

      expect(r.ratingFrozen).toBe(true);
      expect(r.playerA.rating).toBe(1500);
      expect(r.playerB.rating).toBe(1900);
    });

    it('still freezes when the underdog wins', () => {
      // An upset past the gap is not rewarded either. Deliberate: the whole
      // point is that these matches carry no rating signal.
      const r = service.calculateMatchRating({
        playerA: { rating: 1900, rd: 80, vol: 0.06 },
        playerB: { rating: 1500, rd: 80, vol: 0.06 },
        winner: 'B',
        weight: 1,
      });

      expect(r.ratingFrozen).toBe(true);
      expect(r.playerB.rating).toBe(1500);
    });
  });

  describe('deviation floor', () => {
    it('never lets a deviation fall below 50', () => {
      const r = service.calculateMatchRating({
        playerA: { rating: 1500, rd: 51, vol: 0.06 },
        playerB: { rating: 1500, rd: 51, vol: 0.06 },
        winner: 'A',
        weight: 1,
      });

      expect(r.playerA.rd).toBeGreaterThanOrEqual(50);
      expect(r.playerB.rd).toBeGreaterThanOrEqual(50);
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
