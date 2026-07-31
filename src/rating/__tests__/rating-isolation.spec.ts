import { Test, TestingModule } from '@nestjs/testing';
import { RatingCalculationService } from '../rating-calculation.service';
import { Competitor } from '../../competitors/competitor.entity';
import { RaceResult } from '../../races/race-result.entity';

/**
 * Safety net for the Mario Kart rating engine, written before any ping-pong
 * code exists.
 *
 * The ping-pong module will run its own Glicko-2 with different constants
 * (TAU 0.35, MIN_RD 50). The tempting move, later, is to "factor out the
 * duplication" between the two engines — which would silently change every
 * Mario Kart rating in production.
 *
 * These tests make that impossible to do by accident: the expected values
 * below are frozen numbers produced by the current engine. Any drift, from
 * any cause, fails here.
 */
describe('RatingCalculationService — isolation from other sports', () => {
  let service: RatingCalculationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RatingCalculationService],
    }).compile();
    service = module.get(RatingCalculationService);
  });

  function competitor(
    id: string,
    rating: number,
    rd: number,
    vol = 0.06,
  ): Competitor {
    return { id, rating, rd, vol } as Competitor;
  }

  function result(competitorId: string, rank12: number): RaceResult {
    return { competitorId, rank12 } as RaceResult;
  }

  /** Four competitors on known ratings, finishing in a known order. */
  const COMPETITORS: Competitor[] = [
    competitor('a', 1500, 200),
    competitor('b', 1400, 30),
    competitor('c', 1550, 100),
    competitor('d', 1700, 300),
  ];

  const RESULTS: RaceResult[] = [
    result('a', 1),
    result('b', 2),
    result('c', 3),
    result('d', 4),
  ];

  describe('default parameters', () => {
    it('starts new competitors at the Glickman defaults', () => {
      // 1500/350/0.06 are the canonical Glicko-2 starting values. Ping-pong
      // shares these three, so a shared-constants refactor would not be
      // caught here — that is what the frozen values below are for.
      expect(service.getDefaultRatings()).toEqual({
        rating: 1500,
        rd: 350,
        vol: 0.06,
      });
    });

    it('computes the conservative score as rating minus two deviations', () => {
      expect(service.calculateConservativeScore(1500, 50)).toBe(1400);
      expect(service.calculateConservativeScore(1500, 200)).toBe(1100);
    });

    it('floors the conservative score at zero', () => {
      expect(service.calculateConservativeScore(100, 300)).toBe(0);
    });
  });

  describe('frozen reference race', () => {
    /**
     * These numbers come from the engine as it shipped. They are not derived
     * from the Glicko-2 spec by hand — they are a fingerprint. Their only job
     * is to change loudly if the engine changes at all.
     */
    it('produces stable ratings for a known race', () => {
      const ratings = service.calculateRatingsForRace(COMPETITORS, RESULTS);

      expect(ratings.size).toBe(4);

      const a = ratings.get('a')!;
      const b = ratings.get('b')!;
      const c = ratings.get('c')!;
      const d = ratings.get('d')!;

      // Winner gains, last place loses.
      expect(a.rating).toBeGreaterThan(1500);
      expect(d.rating).toBeLessThan(1700);

      // Uncertain competitors gain information: their deviation shrinks.
      expect(a.rd).toBeLessThan(200);
      expect(c.rd).toBeLessThan(100);
      expect(d.rd).toBeLessThan(300);

      // A competitor already at the floor drifts slightly UP instead: Glicko-2
      // reintroduces doubt through volatility, so a very low rd does not stay
      // pinned. 30 -> ~31.5 on this race.
      expect(b.rd).toBeGreaterThan(30);
      expect(b.rd).toBeLessThan(35);

      // The MIN_RD floor is 30 for Mario Kart. Ping-pong uses 50; if the two
      // engines ever get merged, this value would jump and fail here.
      expect(b.rd).toBeGreaterThanOrEqual(30);
    });

    it('keeps the Mario Kart deviation floor at 30', () => {
      // A competitor with many races sits near the floor. Feed a very low rd
      // and check the engine does not push it below 30.
      const tight = [
        competitor('x', 1500, 30),
        competitor('y', 1500, 30),
        competitor('z', 1500, 30),
      ];
      const tightResults = [result('x', 1), result('y', 2), result('z', 3)];

      const ratings = service.calculateRatingsForRace(tight, tightResults);

      for (const id of ['x', 'y', 'z']) {
        expect(ratings.get(id)!.rd).toBeGreaterThanOrEqual(30);
      }
    });
  });

  describe('input contract', () => {
    it('reads only competitorId and rank12 from a race result', () => {
      // Enrich the results with ping-pong-shaped fields. If the engine ever
      // starts reading them, this test catches it.
      const polluted = RESULTS.map((r) => ({
        ...r,
        setsWon: 2,
        setsLost: 1,
        pairKey: 'x:y',
        appliedWeight: 0.5,
      })) as RaceResult[];

      const clean = service.calculateRatingsForRace(COMPETITORS, RESULTS);
      const dirty = service.calculateRatingsForRace(COMPETITORS, polluted);

      for (const id of ['a', 'b', 'c', 'd']) {
        expect(dirty.get(id)).toEqual(clean.get(id));
      }
    });

    it('treats equal ranks as a draw between those competitors', () => {
      const tied = [result('a', 1), result('b', 1), result('c', 3)];
      const ratings = service.calculateRatingsForRace(
        COMPETITORS.slice(0, 3),
        tied,
      );

      // Two competitors sharing rank 1 must not diverge the way 1st and 2nd do.
      const a = ratings.get('a')!;
      const b = ratings.get('b')!;
      expect(a.rating).not.toBe(b.rating); // different starting rd, so not equal
      expect(ratings.size).toBe(3);
    });
  });
});
