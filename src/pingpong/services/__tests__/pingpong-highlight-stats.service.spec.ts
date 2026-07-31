/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PingpongHighlightStatsService,
  EMPTY_HIGHLIGHT_STATS,
} from '../pingpong-highlight-stats.service';
import { PingpongMatch } from '../../entities/pingpong-match.entity';

/**
 * Highlight tallies.
 *
 * These counts cannot come from a column on the player: a shutout set only
 * exists inside one match. Rather than denormalising a flag per achievement —
 * which would need a migration every time a new one is invented, and would
 * leave every match already played unscored — the tallies are replayed from
 * the match log, which already stores the set scores and the before-ratings.
 */
describe('PingpongHighlightStatsService', () => {
  let service: PingpongHighlightStatsService;
  let matchRepository: Repository<PingpongMatch>;

  const PLAYER = 'player-1';
  const OPPONENT = 'player-2';

  /** A match where our player was A, and won unless told otherwise. */
  function match(
    sets: { a: number; b: number }[],
    overrides: Partial<PingpongMatch> = {},
  ) {
    return {
      id: 'm',
      playerAId: PLAYER,
      playerBId: OPPONENT,
      winnerId: PLAYER,
      sets,
      ratingABefore: 1500,
      ratingBBefore: 1500,
      ...overrides,
    } as unknown as PingpongMatch;
  }

  async function buildService(matches: PingpongMatch[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongHighlightStatsService,
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue(matches) },
        },
      ],
    }).compile();

    service = module.get(PingpongHighlightStatsService);
    matchRepository = module.get(getRepositoryToken(PingpongMatch));
  }

  it('returns zeroes for a player with no matches', async () => {
    await buildService([]);
    expect(await service.computeFor(PLAYER)).toEqual(EMPTY_HIGHLIGHT_STATS);
  });

  it('counts a shutout set dealt', async () => {
    await buildService([
      match([
        { a: 11, b: 0 },
        { a: 11, b: 4 },
      ]),
    ]);

    const stats = await service.computeFor(PLAYER);
    expect(stats.pingpongShutoutSetsDealt).toBe(1);
    expect(stats.pingpongShutoutSetsConceded).toBe(0);
  });

  it('counts a shutout set conceded, even in a match won', async () => {
    await buildService([
      match([
        { a: 11, b: 5 },
        { a: 0, b: 11 },
        { a: 11, b: 9 },
      ]),
    ]);

    const stats = await service.computeFor(PLAYER);
    expect(stats.pingpongShutoutSetsConceded).toBe(1);
    expect(stats.pingpongShutoutSetsDealt).toBe(0);
  });

  it('reads the scoreline from the right side when the player was B', async () => {
    // Same 11-0 set, but our player sat on the B side of the table, so the
    // raw numbers are mirrored. Getting this wrong swaps two achievements.
    await buildService([
      match(
        [
          { a: 0, b: 11 },
          { a: 4, b: 11 },
        ],
        { playerAId: OPPONENT, playerBId: PLAYER, winnerId: PLAYER },
      ),
    ]);

    const stats = await service.computeFor(PLAYER);
    expect(stats.pingpongShutoutSetsDealt).toBe(1);
    expect(stats.pingpongShutoutSetsConceded).toBe(0);
  });

  it('counts comebacks only on matches won', async () => {
    await buildService([
      // Dropped the first set, won the match.
      match([
        { a: 5, b: 11 },
        { a: 11, b: 8 },
        { a: 11, b: 6 },
      ]),
      // Dropped the first set and lost — not a comeback.
      match(
        [
          { a: 5, b: 11 },
          { a: 11, b: 8 },
          { a: 6, b: 11 },
        ],
        { winnerId: OPPONENT },
      ),
    ]);

    expect((await service.computeFor(PLAYER)).pingpongComebacks).toBe(1);
  });

  it('counts deuce sets won across matches, won or lost', async () => {
    await buildService([
      match([
        { a: 12, b: 10 },
        { a: 11, b: 4 },
      ]),
      // Lost the match but still took a set past 10-10.
      match(
        [
          { a: 13, b: 11 },
          { a: 5, b: 11 },
          { a: 9, b: 11 },
        ],
        { winnerId: OPPONENT },
      ),
    ]);

    expect((await service.computeFor(PLAYER)).pingpongDeuceSetsWon).toBe(2);
  });

  it('counts an upset from the ratings held before the match', async () => {
    await buildService([
      match(
        [
          { a: 11, b: 8 },
          { a: 11, b: 9 },
        ],
        { ratingABefore: 1400, ratingBBefore: 1620 },
      ),
    ]);

    const stats = await service.computeFor(PLAYER);
    expect(stats.pingpongUpsets).toBe(1);
    expect(stats.pingpongBiggestUpsetGap).toBe(220);
  });

  it('does not count beating a lower-rated opponent as an upset', async () => {
    await buildService([
      match(
        [
          { a: 11, b: 8 },
          { a: 11, b: 9 },
        ],
        { ratingABefore: 1700, ratingBBefore: 1400 },
      ),
    ]);

    const stats = await service.computeFor(PLAYER);
    expect(stats.pingpongUpsets).toBe(0);
    expect(stats.pingpongBiggestUpsetGap).toBe(0);
  });

  it('ignores upsets in matches the player lost', async () => {
    // Losing to someone far above you is the expected outcome, not a feat.
    await buildService([
      match(
        [
          { a: 8, b: 11 },
          { a: 9, b: 11 },
        ],
        { winnerId: OPPONENT, ratingABefore: 1400, ratingBBefore: 1700 },
      ),
    ]);

    expect((await service.computeFor(PLAYER)).pingpongUpsets).toBe(0);
  });

  it('keeps the largest gap, not the most recent', async () => {
    await buildService([
      match([{ a: 11, b: 8 }, { a: 11, b: 9 }], {
        ratingABefore: 1400,
        ratingBBefore: 1700,
      }),
      match([{ a: 11, b: 8 }, { a: 11, b: 9 }], {
        ratingABefore: 1400,
        ratingBBefore: 1560,
      }),
    ]);

    expect((await service.computeFor(PLAYER)).pingpongBiggestUpsetGap).toBe(300);
  });

  it('counts a heist', async () => {
    await buildService([
      match([
        { a: 5, b: 11 },
        { a: 12, b: 10 },
        { a: 15, b: 13 },
      ]),
    ]);

    expect((await service.computeFor(PLAYER)).pingpongHeists).toBe(1);
  });

  it('tallies across the whole history rather than the last match', async () => {
    await buildService([
      match([
        { a: 11, b: 0 },
        { a: 11, b: 4 },
      ]),
      match([
        { a: 11, b: 2 },
        { a: 11, b: 0 },
      ]),
      match([
        { a: 11, b: 0 },
        { a: 0, b: 11 },
        { a: 11, b: 9 },
      ]),
    ]);

    const stats = await service.computeFor(PLAYER);
    // Three matches contained a shutout set dealt; the achievement counts
    // matches, not sets, so a match with two 11-0 sets still counts once.
    expect(stats.pingpongShutoutSetsDealt).toBe(3);
    expect(stats.pingpongShutoutSetsConceded).toBe(1);
  });

  it('asks the database only for matches this player took part in', async () => {
    await buildService([]);
    await service.computeFor(PLAYER);

    const call = jest.mocked(matchRepository.find).mock.calls[0][0];
    // A `find` without a where clause would tally the entire league onto one
    // player, and every player would unlock everything at once.
    expect(call?.where).toBeDefined();
    expect(JSON.stringify(call?.where)).toContain(PLAYER);
  });

  it('tolerates a match row with no set scores', async () => {
    // Older rows, or a bad import, should not take the achievement engine down
    // for the whole user.
    await buildService([
      match(null as unknown as { a: number; b: number }[]),
      match([
        { a: 11, b: 0 },
        { a: 11, b: 4 },
      ]),
    ]);

    expect((await service.computeFor(PLAYER)).pingpongShutoutSetsDealt).toBe(1);
  });
});
