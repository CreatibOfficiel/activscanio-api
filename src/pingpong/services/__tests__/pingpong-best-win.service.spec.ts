/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongBestWinService } from '../pingpong-best-win.service';
import { PingpongMatch } from '../../entities/pingpong-match.entity';

/**
 * Highest-rated opponent ever beaten.
 *
 * The point of this metric is that it is MONOTONE: it only ever goes up, and
 * nobody else's activity can lower it. A rank cannot say that — it is
 * zero-sum, so half a 25-person office sits in the bottom half by
 * construction. A peak rating cannot say it either: Glicko-2 ratings fall,
 * and the RD decay cron drops a rating while its owner is on holiday, so a
 * peak is a goal the player has already failed.
 *
 * Replayed from the match log rather than denormalised into a column, for the
 * reasons set out in `PingpongHighlightStatsService`: no migration per
 * metric, and every match already played counts retroactively.
 */
describe('PingpongBestWinService', () => {
  let service: PingpongBestWinService;
  let matchRepository: Repository<PingpongMatch>;

  const PLAYER = 'player-1';
  const OPPONENT = 'player-2';

  /** A match where our player was A, and won unless told otherwise. */
  function match(overrides: Partial<PingpongMatch> = {}) {
    return {
      id: 'm',
      playerAId: PLAYER,
      playerBId: OPPONENT,
      winnerId: PLAYER,
      ratingABefore: 1500,
      ratingBBefore: 1500,
      ratingAAfter: 1500,
      ratingBAfter: 1500,
      playedAt: new Date('2026-01-01'),
      ...overrides,
    } as unknown as PingpongMatch;
  }

  async function buildService(matches: PingpongMatch[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongBestWinService,
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue(matches) },
        },
      ],
    }).compile();

    service = module.get(PingpongBestWinService);
    matchRepository = module.get(getRepositoryToken(PingpongMatch));
  }

  it('returns null for a player with no matches', async () => {
    // Not 0. "Meilleure victoire : 0" reads as having beaten someone rated
    // zero, which is a worse thing to show than showing nothing.
    await buildService([]);
    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('returns null for a player who has never won', async () => {
    await buildService([
      match({ winnerId: OPPONENT, ratingBBefore: 1800 }),
      match({ winnerId: OPPONENT, ratingBBefore: 1700 }),
    ]);

    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('reports the rating of the opponent beaten', async () => {
    await buildService([match({ ratingBBefore: 1642 })]);

    const best = await service.computeFor(PLAYER);
    expect(best?.opponentRating).toBe(1642);
    expect(best?.opponentId).toBe(OPPONENT);
  });

  it('ignores losses against stronger opponents', async () => {
    // The load-bearing rule. Losing to a 1900 is not a feat, and counting it
    // would let anyone mint a record by being thrashed by the best player.
    await buildService([
      match({ winnerId: OPPONENT, ratingBBefore: 1900 }),
      match({ ratingBBefore: 1550 }),
    ]);

    const best = await service.computeFor(PLAYER);
    expect(best?.opponentRating).toBe(1550);
  });

  it('reads the opponent rating from BEFORE the match, not after', async () => {
    // After the match the opponent has already been docked points for the
    // loss, so reading `ratingBAfter` would understate the feat — and would
    // shrink the record every time the beaten player later declined.
    await buildService([match({ ratingBBefore: 1700, ratingBAfter: 1660 })]);

    expect((await service.computeFor(PLAYER))?.opponentRating).toBe(1700);
  });

  it('reads the opponent side when the player sat on side B', async () => {
    // Getting this backwards reports the player's own rating as the record.
    await buildService([
      match({
        playerAId: OPPONENT,
        playerBId: PLAYER,
        winnerId: PLAYER,
        ratingABefore: 1710,
        ratingBBefore: 1400,
      }),
    ]);

    const best = await service.computeFor(PLAYER);
    expect(best?.opponentRating).toBe(1710);
    expect(best?.opponentId).toBe(OPPONENT);
  });

  it('keeps the highest rating beaten, not the most recent win', async () => {
    await buildService([
      match({ ratingBBefore: 1750, playedAt: new Date('2026-01-01') }),
      match({ ratingBBefore: 1500, playedAt: new Date('2026-02-01') }),
    ]);

    expect((await service.computeFor(PLAYER))?.opponentRating).toBe(1750);
  });

  it('is not lowered by a later loss', async () => {
    // Monotonicity, stated directly. This is the whole reason the metric
    // exists rather than a peak rating.
    await buildService([match({ ratingBBefore: 1750 })]);
    const before = await service.computeFor(PLAYER);

    await buildService([
      match({ ratingBBefore: 1750 }),
      match({ winnerId: OPPONENT, ratingBBefore: 1900 }),
    ]);
    const after = await service.computeFor(PLAYER);

    expect(after?.opponentRating).toBe(before?.opponentRating);
  });

  it('is not lowered by a later win against a weaker player', async () => {
    await buildService([
      match({ ratingBBefore: 1750 }),
      match({ ratingBBefore: 1200 }),
    ]);

    expect((await service.computeFor(PLAYER))?.opponentRating).toBe(1750);
  });

  it('reports when the win happened and who it was against', async () => {
    // The date belongs to the match that set the record, not the latest one.
    await buildService([
      match({ ratingBBefore: 1750, playedAt: new Date('2026-03-04') }),
      match({ ratingBBefore: 1300, playedAt: new Date('2026-05-09') }),
    ]);

    const best = await service.computeFor(PLAYER);
    expect(best?.playedAt).toEqual(new Date('2026-03-04'));
    expect(best?.matchId).toBeDefined();
  });

  it('skips a match with no recorded opponent rating', async () => {
    // A null must not become a 0 and must not become the record.
    await buildService([
      match({ ratingBBefore: null as unknown as number }),
      match({ ratingBBefore: 1480 }),
    ]);

    expect((await service.computeFor(PLAYER))?.opponentRating).toBe(1480);
  });

  it('returns null when the only win has no opponent rating', async () => {
    await buildService([match({ ratingBBefore: null as unknown as number })]);
    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('asks the database only for matches this player took part in', async () => {
    await buildService([]);
    await service.computeFor(PLAYER);

    const call = jest.mocked(matchRepository.find).mock.calls[0][0];
    // Without a where clause the record would be the strongest player anyone
    // in the office ever beat, awarded to everybody.
    expect(call?.where).toBeDefined();
    expect(JSON.stringify(call?.where)).toContain(PLAYER);
  });
});
