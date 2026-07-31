/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementCalculatorService } from '../achievement-calculator.service';
import { XPLevelService } from '../xp-level.service';
import { Achievement } from '../../entities/achievement.entity';
import { UserAchievement } from '../../entities/user-achievement.entity';
import { UserStreak } from '../../entities/user-streak.entity';
import { User } from '../../../users/user.entity';
import { Competitor } from '../../../competitors/competitor.entity';
import { PingpongPlayer } from '../../../pingpong/entities/pingpong-player.entity';

/**
 * Racing metrics that must survive the betting removal.
 *
 * getUserStats currently computes ~25 betting figures alongside 8 competitor
 * ones and 5 streak counters. Only the latter two groups outlive the betting
 * module, so they are pinned here before the cut.
 *
 * getUserStats is private, so these tests reach it through checkAchievements,
 * asserting on which achievements unlock for a given competitor state.
 */
describe('AchievementCalculatorService — racing metrics', () => {
  let service: AchievementCalculatorService;
  let achievementRepository: Repository<Achievement>;
  let userAchievementRepository: Repository<UserAchievement>;
  let userStreakRepository: Repository<UserStreak>;
  let userRepository: Repository<User>;
  let competitorRepository: Repository<Competitor>;

  const USER_ID = 'user-1';
  const COMPETITOR_ID = 'competitor-1';

  /** Query builder stub returning nothing, for the betting aggregates. */
  function emptyQueryBuilder() {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'leftJoin',
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'groupBy',
      'addGroupBy',
      'having',
      'orderBy',
      'addOrderBy',
      'limit',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getRawOne = jest.fn().mockResolvedValue(null);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getMany = jest.fn().mockResolvedValue([]);
    return qb;
  }

  /** An achievement gated on a single numeric metric. */
  function racingAchievement(key: string, metric: string, value: number) {
    return {
      id: key,
      key,
      name: key,
      description: key,
      domain: 'RACING',
      xpReward: 10,
      condition: {
        type: 'count',
        metric,
        operator: 'gte',
        value,
      },
    } as unknown as Achievement;
  }

  async function buildService(achievements: Achievement[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementCalculatorService,
        {
          provide: getRepositoryToken(Achievement),
          useValue: { find: jest.fn().mockResolvedValue(achievements) },
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
            findOne: jest.fn(),
            increment: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: XPLevelService,
          useValue: { awardXP: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(AchievementCalculatorService);
    achievementRepository = module.get(getRepositoryToken(Achievement));
    userAchievementRepository = module.get(getRepositoryToken(UserAchievement));
    userStreakRepository = module.get(getRepositoryToken(UserStreak));
    userRepository = module.get(getRepositoryToken(User));
    competitorRepository = module.get(getRepositoryToken(Competitor));

    void achievementRepository;
    void userAchievementRepository;
    void userStreakRepository;
  }

  /** Wire the user to a competitor carrying the given stats. */
  function withCompetitor(stats: Partial<Competitor>) {
    jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue({ id: USER_ID, competitorId: COMPETITOR_ID } as User);
    jest.spyOn(competitorRepository, 'findOne').mockResolvedValue({
      id: COMPETITOR_ID,
      rating: 1500,
      rd: 50,
      totalWins: 0,
      raceCount: 0,
      winStreak: 0,
      bestWinStreak: 0,
      playStreak: 0,
      bestPlayStreak: 0,
      avgRank12: 0,
      ...stats,
    } as Competitor);
  }

  const unlockedKeys = (results: { achievementKey: string }[]) =>
    results.map((r) => r.achievementKey);

  it('unlocks on competitorTotalWins', async () => {
    await buildService([racingAchievement('five_wins', 'competitorTotalWins', 5)]);
    withCompetitor({ totalWins: 5 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).toContain('five_wins');
  });

  it('stays locked when competitorTotalWins is short', async () => {
    await buildService([racingAchievement('five_wins', 'competitorTotalWins', 5)]);
    withCompetitor({ totalWins: 4 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).not.toContain('five_wins');
  });

  it('unlocks on competitorRaceCount', async () => {
    await buildService([racingAchievement('ten_races', 'competitorRaceCount', 10)]);
    withCompetitor({ raceCount: 12 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).toContain('ten_races');
  });

  it('unlocks on competitorWinStreak', async () => {
    await buildService([racingAchievement('streak_3', 'competitorWinStreak', 3)]);
    withCompetitor({ winStreak: 3 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).toContain('streak_3');
  });

  it('unlocks on competitorBestWinStreak', async () => {
    await buildService([
      racingAchievement('best_streak_5', 'competitorBestWinStreak', 5),
    ]);
    withCompetitor({ bestWinStreak: 6 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).toContain('best_streak_5');
  });

  it('unlocks on competitorPlayStreak', async () => {
    await buildService([
      racingAchievement('play_streak_5', 'competitorPlayStreak', 5),
    ]);
    withCompetitor({ playStreak: 5 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).toContain('play_streak_5');
  });

  it('scores competitorRating on the conservative score, not the raw rating', async () => {
    await buildService([racingAchievement('elo_1600', 'competitorRating', 1600)]);
    // rating 1700 with rd 60 gives 1700 - 2*60 = 1580, which is below 1600.
    withCompetitor({ rating: 1700, rd: 60 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).not.toContain('elo_1600');
  });

  it('unlocks competitorRating once the conservative score clears the bar', async () => {
    await buildService([racingAchievement('elo_1600', 'competitorRating', 1600)]);
    // rating 1750 with rd 50 gives 1650.
    withCompetitor({ rating: 1750, rd: 50 });

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).toContain('elo_1600');
  });

  it('skips racing achievements for a user with no competitor', async () => {
    await buildService([racingAchievement('five_wins', 'competitorTotalWins', 5)]);
    jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue({ id: USER_ID, competitorId: null } as User);

    const unlocked = await service.checkAchievements(USER_ID);

    expect(unlockedKeys(unlocked)).not.toContain('five_wins');
  });
});
