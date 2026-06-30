import { DuelsService } from '../duels.service';
import { Duel, DuelConditionType } from '../duel.entity';
import { RaceResult } from '../../races/race-result.entity';

/**
 * Focused unit tests for the pure condition-evaluation logic. We instantiate
 * the service without the NestJS DI container (deps are unused by evaluateDuel)
 * and call the private method via a typed accessor.
 */
describe('DuelsService.evaluateDuel', () => {
  const service = new DuelsService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );

  const evaluate = (
    duel: Partial<Duel>,
    a: Partial<RaceResult>,
    b: Partial<RaceResult>,
  ): 'challenger' | 'challenged' | 'draw' =>
    (
      service as unknown as {
        evaluateDuel: (
          d: Duel,
          ra: RaceResult,
          rb: RaceResult,
        ) => 'challenger' | 'challenged' | 'draw';
      }
    ).evaluateDuel(duel as Duel, a as RaceResult, b as RaceResult);

  describe('RANK_WINS (default)', () => {
    it('better rank wins', () => {
      expect(
        evaluate(
          { conditionType: null },
          { rank12: 1, score: 50 },
          { rank12: 3, score: 80 },
        ),
      ).toBe('challenger');
      expect(
        evaluate(
          { conditionType: null },
          { rank12: 4, score: 90 },
          { rank12: 2, score: 30 },
        ),
      ).toBe('challenged');
    });

    it('rank tie is a draw', () => {
      expect(
        evaluate(
          { conditionType: DuelConditionType.RANK_WINS },
          { rank12: 2, score: 50 },
          { rank12: 2, score: 70 },
        ),
      ).toBe('draw');
    });
  });

  describe('MARGIN_GREATER', () => {
    const duel = {
      conditionType: DuelConditionType.MARGIN_GREATER,
      conditionValue: 20,
    };

    it('challenger wins only if better-ranked AND margin > X', () => {
      expect(
        evaluate(duel, { rank12: 1, score: 100 }, { rank12: 2, score: 70 }),
      ).toBe('challenger');
    });

    it('challenged wins if margin too small', () => {
      expect(
        evaluate(duel, { rank12: 1, score: 80 }, { rank12: 2, score: 70 }),
      ).toBe('challenged');
    });

    it('challenged wins if challenger not better-ranked', () => {
      expect(
        evaluate(duel, { rank12: 3, score: 100 }, { rank12: 1, score: 50 }),
      ).toBe('challenged');
    });
  });

  describe('EXACT_TIE', () => {
    const duel = { conditionType: DuelConditionType.EXACT_TIE };

    it('challenger wins on a rank tie', () => {
      expect(
        evaluate(duel, { rank12: 2, score: 50 }, { rank12: 2, score: 90 }),
      ).toBe('challenger');
    });

    it('challenged wins when no tie', () => {
      expect(
        evaluate(duel, { rank12: 1, score: 50 }, { rank12: 2, score: 90 }),
      ).toBe('challenged');
    });
  });

  describe('MARGIN_BETWEEN', () => {
    const duel = {
      conditionType: DuelConditionType.MARGIN_BETWEEN,
      conditionValue: 30,
    };

    it('better rank wins when gap is large enough', () => {
      expect(
        evaluate(duel, { rank12: 1, score: 100 }, { rank12: 2, score: 60 }),
      ).toBe('challenger');
    });

    it('condition-setter (challenger) loses when gap too small', () => {
      expect(
        evaluate(duel, { rank12: 1, score: 80 }, { rank12: 2, score: 70 }),
      ).toBe('challenged');
    });

    it('draw when gap large but ranks tie', () => {
      expect(
        evaluate(duel, { rank12: 2, score: 100 }, { rank12: 2, score: 60 }),
      ).toBe('draw');
    });
  });
});
