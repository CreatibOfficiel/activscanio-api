import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementCalculatorService } from '../achievement-calculator.service';
import { XPLevelService } from '../xp-level.service';
import { ACHIEVEMENT_DEFINITIONS } from '../../config/achievement-definitions';
import {
  Achievement,
  AchievementDomain,
} from '../../entities/achievement.entity';
import { UserAchievement } from '../../entities/user-achievement.entity';
import { UserStreak } from '../../entities/user-streak.entity';
import { User } from '../../../users/user.entity';
import { Competitor } from '../../../competitors/competitor.entity';
import { PingpongPlayer } from '../../../pingpong/entities/pingpong-player.entity';
import { PingpongMatch } from '../../../pingpong/entities/pingpong-match.entity';
import { PingpongHighlightStatsService } from '../../../pingpong/services/pingpong-highlight-stats.service';

/**
 * Per-match feats, end to end.
 *
 * The unit tests cover detection and tallying separately, which leaves the
 * seam untested: the real catalogue definitions, read through the real metric
 * lookup, against real match rows. A metric name that matches no case falls
 * through to `getMetricValue`'s default of 0 — silently, with only a log
 * line — so a typo here would never unlock anything and nothing else would
 * notice. Only the repositories are faked.
 */
describe('Ping-pong per-match feats — end to end', () => {
  let service: AchievementCalculatorService;

  const USER_ID = 'user-1';
  const PLAYER_ID = 'pp-1';
  const OPPONENT_ID = 'pp-2';

  /** The real definitions, as an entity would come back from the database. */
  const pingpongAchievements = ACHIEVEMENT_DEFINITIONS.filter(
    (d) => d.domain === AchievementDomain.PINGPONG,
  ).map((d, i) => ({ ...d, id: `ach-${i}` }) as unknown as Achievement);

  function match(
    sets: { a: number; b: number }[],
    overrides: Partial<PingpongMatch> = {},
  ) {
    return {
      playerAId: PLAYER_ID,
      playerBId: OPPONENT_ID,
      winnerId: PLAYER_ID,
      sets,
      ratingABefore: 1500,
      ratingBBefore: 1500,
      ...overrides,
    } as unknown as PingpongMatch;
  }

  async function buildService(matches: PingpongMatch[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementCalculatorService,
        // The real service, wired to a fake match table.
        PingpongHighlightStatsService,
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue(matches) },
        },
        {
          provide: getRepositoryToken(Achievement),
          useValue: {
            find: jest.fn().mockResolvedValue(pingpongAchievements),
          },
        },
        {
          provide: getRepositoryToken(UserAchievement),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((v: unknown) => v),
            save: jest.fn((v: unknown) => v),
          },
        },
        {
          provide: getRepositoryToken(UserStreak),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue({ id: USER_ID, competitorId: 'comp-1' }),
            increment: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: PLAYER_ID,
              competitorId: 'comp-1',
              rating: 1500,
              rd: 80,
              matchCount: 1,
              weightedMatchCount: 1,
              wins: 1,
              losses: 0,
              setsWon: 2,
              setsLost: 0,
              currentStreak: 1,
              bestStreak: 1,
              distinctOpponents21d: 1,
              diversityScore21d: 0,
            }),
          },
        },
        {
          provide: XPLevelService,
          useValue: { awardXP: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(AchievementCalculatorService);
  }

  async function unlockedKeys(matches: PingpongMatch[]) {
    await buildService(matches);
    const results = await service.checkAchievements(USER_ID);
    return results.map((r) => r.achievementKey);
  }

  it('unlocks La Bulle from a match containing an 11-0 set', async () => {
    const keys = await unlockedKeys([
      match([
        { a: 11, b: 0 },
        { a: 11, b: 6 },
      ]),
    ]);

    expect(keys).toContain('pp_la_bulle');
  });

  it('unlocks Crème Fraîche from a set conceded 0-11', async () => {
    const keys = await unlockedKeys([
      match([
        { a: 11, b: 5 },
        { a: 0, b: 11 },
        { a: 11, b: 7 },
      ]),
    ]);

    expect(keys).toContain('pp_creme_fraiche');
    expect(keys).not.toContain('pp_la_bulle');
  });

  it('unlocks Retour des Enfers after dropping the first set and winning', async () => {
    const keys = await unlockedKeys([
      match([
        { a: 6, b: 11 },
        { a: 11, b: 8 },
        { a: 11, b: 9 },
      ]),
    ]);

    expect(keys).toContain('pp_retour_des_enfers');
  });

  it('unlocks Le Tombeur when the opponent was rated far higher', async () => {
    const keys = await unlockedKeys([
      match(
        [
          { a: 11, b: 8 },
          { a: 11, b: 9 },
        ],
        { ratingABefore: 1420, ratingBBefore: 1650 },
      ),
    ]);

    expect(keys).toContain('pp_le_tombeur');
  });

  it("holds À l'Arrache back until five deuce sets", async () => {
    const deuceWin = () =>
      match([
        { a: 12, b: 10 },
        { a: 11, b: 4 },
      ]);

    const four = await unlockedKeys([
      deuceWin(),
      deuceWin(),
      deuceWin(),
      deuceWin(),
    ]);
    expect(four).not.toContain('pp_a_larrache');

    const five = await unlockedKeys([
      deuceWin(),
      deuceWin(),
      deuceWin(),
      deuceWin(),
      deuceWin(),
    ]);
    expect(five).toContain('pp_a_larrache');
  });

  it('unlocks Le Casse on the full shape and nothing less', async () => {
    const heist = await unlockedKeys([
      match([
        { a: 4, b: 11 },
        { a: 12, b: 10 },
        { a: 15, b: 13 },
      ]),
    ]);
    expect(heist).toContain('pp_le_casse');

    // One deuce set short: a comeback, but not a heist.
    const nearMiss = await unlockedKeys([
      match([
        { a: 4, b: 11 },
        { a: 12, b: 10 },
        { a: 11, b: 5 },
      ]),
    ]);
    expect(nearMiss).toContain('pp_retour_des_enfers');
    expect(nearMiss).not.toContain('pp_le_casse');
  });

  it('unlocks nothing per-match for a player with a clean record', async () => {
    const keys = await unlockedKeys([
      match([
        { a: 11, b: 6 },
        { a: 11, b: 8 },
      ]),
    ]);

    for (const key of [
      'pp_la_bulle',
      'pp_creme_fraiche',
      'pp_retour_des_enfers',
      'pp_a_larrache',
      'pp_le_tombeur',
      'pp_le_casse',
    ]) {
      expect(keys).not.toContain(key);
    }
  });

  it('reads every per-match metric through a real switch case', async () => {
    // getMetricValue returns 0 for an unknown metric, so a typo in a
    // definition would simply never fire. This proves each one resolves.
    const everything = await unlockedKeys([
      match(
        [
          { a: 4, b: 11 },
          { a: 12, b: 10 },
          { a: 15, b: 13 },
        ],
        { ratingABefore: 1400, ratingBBefore: 1700 },
      ),
      match([
        { a: 11, b: 0 },
        { a: 0, b: 11 },
        { a: 12, b: 10 },
      ]),
      match([
        { a: 13, b: 11 },
        { a: 12, b: 10 },
      ]),
      match([
        { a: 12, b: 10 },
        { a: 14, b: 12 },
      ]),
      // Five matches with a deuce set in total — the threshold for À l'Arrache.
      match([
        { a: 12, b: 10 },
        { a: 11, b: 3 },
      ]),
      match([
        { a: 13, b: 11 },
        { a: 11, b: 2 },
      ]),
    ]);

    expect(everything).toEqual(
      expect.arrayContaining([
        'pp_la_bulle',
        'pp_creme_fraiche',
        'pp_retour_des_enfers',
        'pp_a_larrache',
        'pp_le_tombeur',
        'pp_le_casse',
      ]),
    );
  });
});
