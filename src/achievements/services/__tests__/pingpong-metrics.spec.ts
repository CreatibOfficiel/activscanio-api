/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementCalculatorService } from '../achievement-calculator.service';
import { XPLevelService } from '../xp-level.service';
import {
  Achievement,
  AchievementDomain,
} from '../../entities/achievement.entity';
import { UserAchievement } from '../../entities/user-achievement.entity';
import { UserStreak } from '../../entities/user-streak.entity';
import { User } from '../../../users/user.entity';
import { Competitor } from '../../../competitors/competitor.entity';
import { PingpongPlayer } from '../../../pingpong/entities/pingpong-player.entity';
import {
  PingpongHighlightStatsService,
  EMPTY_HIGHLIGHT_STATS,
} from '../../../pingpong/services/pingpong-highlight-stats.service';

/**
 * Ping-pong achievement metrics.
 *
 * The metric namespace is flat and global: a `winStreak` case added without a
 * prefix would silently answer for Mario Kart achievements too. Hence the
 * `pingpong` prefix on every one of these, mirroring the `competitor` prefix
 * already used for racing.
 */
describe('AchievementCalculatorService — ping-pong metrics', () => {
  let service: AchievementCalculatorService;
  let userRepository: Repository<User>;
  let competitorRepository: Repository<Competitor>;
  let pingpongPlayerRepository: Repository<PingpongPlayer>;

  const USER_ID = 'user-1';

  function achievement(key: string, metric: string, value: number) {
    return {
      id: key,
      key,
      name: key,
      description: key,
      domain: AchievementDomain.PINGPONG,
      xpReward: 10,
      condition: { type: 'count', metric, operator: 'gte', value },
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
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: PingpongHighlightStatsService,
          useValue: {
            computeFor: jest.fn().mockResolvedValue(EMPTY_HIGHLIGHT_STATS),
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
    userRepository = module.get(getRepositoryToken(User));
    competitorRepository = module.get(getRepositoryToken(Competitor));
    pingpongPlayerRepository = module.get(getRepositoryToken(PingpongPlayer));
  }

  function withPingpongPlayer(stats: Partial<PingpongPlayer>) {
    jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue({ id: USER_ID, competitorId: 'comp-1' } as User);
    jest.spyOn(pingpongPlayerRepository, 'findOne').mockResolvedValue({
      id: 'pp-1',
      competitorId: 'comp-1',
      rating: 1500,
      rd: 50,
      matchCount: 0,
      weightedMatchCount: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      currentStreak: 0,
      bestStreak: 0,
      distinctOpponents21d: 0,
      diversityScore21d: 0,
      ...stats,
    } as PingpongPlayer);
  }

  const keys = (r: { achievementKey: string }[]) =>
    r.map((x) => x.achievementKey);

  it('unlocks on the number of matches played', async () => {
    await buildService([achievement('pp_first', 'pingpongMatchCount', 1)]);
    withPingpongPlayer({ matchCount: 1 });

    expect(keys(await service.checkAchievements(USER_ID))).toContain('pp_first');
  });

  it('unlocks on wins', async () => {
    await buildService([achievement('pp_wins', 'pingpongWins', 25)]);
    withPingpongPlayer({ wins: 25 });

    expect(keys(await service.checkAchievements(USER_ID))).toContain('pp_wins');
  });

  it('unlocks on the best streak', async () => {
    await buildService([achievement('pp_streak', 'pingpongBestStreak', 5)]);
    withPingpongPlayer({ bestStreak: 6 });

    expect(keys(await service.checkAchievements(USER_ID))).toContain(
      'pp_streak',
    );
  });

  it('measures the rating on the conservative score, not the raw rating', async () => {
    await buildService([achievement('pp_elo', 'pingpongRating', 1600)]);
    // 1700 with a deviation of 60 is 1580 conservatively — below the bar.
    withPingpongPlayer({ rating: 1700, rd: 60 });

    expect(keys(await service.checkAchievements(USER_ID))).not.toContain(
      'pp_elo',
    );
  });

  it('unlocks the rating achievement once the conservative score clears it', async () => {
    await buildService([achievement('pp_elo', 'pingpongRating', 1600)]);
    withPingpongPlayer({ rating: 1750, rd: 50 });

    expect(keys(await service.checkAchievements(USER_ID))).toContain('pp_elo');
  });

  it('leaves calibration achievements on the weighted count', async () => {
    // Farming one opponent inflates matchCount but not weightedMatchCount, so
    // a calibration achievement must read the weighted one.
    await buildService([
      achievement('pp_calibrated', 'pingpongWeightedMatchCount', 8),
    ]);
    withPingpongPlayer({ matchCount: 12, weightedMatchCount: 6 });

    expect(keys(await service.checkAchievements(USER_ID))).not.toContain(
      'pp_calibrated',
    );
  });

  it('unlocks on distinct opponents faced', async () => {
    await buildService([
      achievement('pp_social', 'pingpongDistinctOpponents', 8),
    ]);
    withPingpongPlayer({ distinctOpponents21d: 8 });

    expect(keys(await service.checkAchievements(USER_ID))).toContain(
      'pp_social',
    );
  });

  it('skips ping-pong achievements for someone who does not play', async () => {
    await buildService([achievement('pp_first', 'pingpongMatchCount', 1)]);
    jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue({ id: USER_ID, competitorId: 'comp-1' } as User);
    jest.spyOn(pingpongPlayerRepository, 'findOne').mockResolvedValue(null);

    expect(keys(await service.checkAchievements(USER_ID))).not.toContain(
      'pp_first',
    );
  });

  it('does not award racing achievements to a ping-pong-only player', async () => {
    const racing = {
      id: 'mk_first',
      key: 'mk_first',
      name: 'mk_first',
      description: 'mk_first',
      domain: AchievementDomain.RACING,
      xpReward: 10,
      condition: {
        type: 'count',
        metric: 'competitorRaceCount',
        operator: 'gte',
        value: 1,
      },
    } as unknown as Achievement;

    await buildService([racing]);
    withPingpongPlayer({ matchCount: 20 });
    jest.spyOn(competitorRepository, 'findOne').mockResolvedValue(null);

    expect(keys(await service.checkAchievements(USER_ID))).not.toContain(
      'mk_first',
    );
  });
});
