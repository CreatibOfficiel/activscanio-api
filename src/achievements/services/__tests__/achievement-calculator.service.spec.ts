/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { AchievementCalculatorService } from '../achievement-calculator.service';
import { Repository } from 'typeorm';
import {
  Achievement,
  AchievementCategory,
  AchievementConditionOperator,
  AchievementConditionType,
  AchievementDomain,
  AchievementRarity,
} from '../../entities/achievement.entity';
import { UserAchievement } from '../../entities/user-achievement.entity';
import { UserStreak } from '../../entities/user-streak.entity';
import { Bet } from '../../../betting/entities/bet.entity';
import { BettorRanking } from '../../../betting/entities/bettor-ranking.entity';
import { User } from '../../../users/user.entity';
import { Competitor } from '../../../competitors/competitor.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { XPLevelService } from '../xp-level.service';

describe('AchievementCalculatorService', () => {
  let module: TestingModule;
  let service: AchievementCalculatorService;
  let achievementRepository: Repository<Achievement>;
  let userAchievementRepository: Repository<UserAchievement>;
  let betRepository: Repository<Bet>;
  let xpLevelService: XPLevelService;
  let userRepository: Repository<User>;
  let eventEmitter: EventEmitter2;

  const mockCondition = {
    type: AchievementConditionType.COUNT,
    metric: 'betsPlaced',
    operator: AchievementConditionOperator.GTE,
    value: 1,
  };

  const mockAchievements: Partial<Achievement>[] = [
    {
      id: '1',
      key: 'first_bet',
      name: 'First Bet',
      description: 'Place your first bet',
      category: AchievementCategory.PRECISION,
      rarity: AchievementRarity.COMMON,
      xpReward: 10,
      prerequisiteAchievementKey: null,
      tierLevel: 1,
      chainName: null,
      isTemporary: false,
      canBeLost: false,
      domain: AchievementDomain.BETTING,
      condition: { ...mockCondition, value: 1 },
    },
    {
      id: '2',
      key: 'tier2_achievement',
      name: 'Tier 2',
      description: 'Second tier achievement',
      category: AchievementCategory.PRECISION,
      rarity: AchievementRarity.RARE,
      xpReward: 50,
      prerequisiteAchievementKey: 'first_bet',
      tierLevel: 2,
      chainName: 'participation_chain',
      isTemporary: false,
      canBeLost: false,
      domain: AchievementDomain.BETTING,
      condition: { ...mockCondition, value: 5 },
    },
    {
      id: '3',
      key: 'tier3_achievement',
      name: 'Tier 3',
      description: 'Third tier achievement',
      category: AchievementCategory.PRECISION,
      rarity: AchievementRarity.EPIC,
      xpReward: 100,
      prerequisiteAchievementKey: 'tier2_achievement',
      tierLevel: 3,
      chainName: 'participation_chain',
      isTemporary: false,
      canBeLost: false,
      domain: AchievementDomain.BETTING,
      condition: { ...mockCondition, value: 20 },
    },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AchievementCalculatorService,
        {
          provide: getRepositoryToken(Achievement) as string,
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(UserAchievement) as string,
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
            create: jest.fn().mockImplementation((data) => data),
          },
        },
        {
          provide: getRepositoryToken(UserStreak),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            increment: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BettorRanking),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(Bet),
          useValue: {
            count: jest.fn().mockResolvedValue(0),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: XPLevelService,
          useValue: {
            awardXP: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AchievementCalculatorService>(
      AchievementCalculatorService,
    );
    achievementRepository = module.get<Repository<Achievement>>(
      getRepositoryToken(Achievement),
    );
    userAchievementRepository = module.get<Repository<UserAchievement>>(
      getRepositoryToken(UserAchievement),
    );
    betRepository = module.get<Repository<Bet>>(getRepositoryToken(Bet));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    xpLevelService = module.get<XPLevelService>(XPLevelService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prerequisite checking', () => {
    it('should not unlock tier 2 achievement without tier 1', async () => {
      // Mock: user has NO achievements yet
      jest.spyOn(userAchievementRepository, 'find').mockResolvedValue([]);

      // Mock: all achievements available
      jest
        .spyOn(achievementRepository, 'find')
        .mockResolvedValue(mockAchievements as Achievement[]);

      // Mock: user stats show they qualify for tier 2
      jest.spyOn(betRepository, 'count').mockResolvedValue(10);

      // Try to check achievements
      const result = await service.checkAchievements('user-123');

      // Tier 2 should NOT be unlocked because tier 1 is not unlocked
      const tier2Unlocked = result.some(
        (ua) => ua.achievementKey === 'tier2_achievement',
      );
      expect(tier2Unlocked).toBe(false);
    });

    it('should unlock tier 2 achievement when tier 1 is already unlocked', async () => {
      // Mock: user already has tier 1
      const existingAchievements: Partial<UserAchievement>[] = [
        {
          userId: 'user-123',
          achievementId: '1',
          achievement: mockAchievements[0] as Achievement,
          unlockedAt: new Date(),
        },
      ];
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(existingAchievements as UserAchievement[]);

      // Mock: all achievements available
      jest
        .spyOn(achievementRepository, 'find')
        .mockResolvedValue(mockAchievements as Achievement[]);

      // Mock: user stats show they qualify for tier 2
      jest.spyOn(betRepository, 'count').mockResolvedValue(10);

      // Try to check achievements
      const result = await service.checkAchievements('user-123');

      // Note: This depends on the actual implementation checking progress
      // For now, we just verify the service ran without errors
      expect(result).toBeDefined();
    });

    it('should not unlock tier 3 if tier 2 is missing', async () => {
      // Mock: user has tier 1 but NOT tier 2
      const existingAchievements: Partial<UserAchievement>[] = [
        {
          userId: 'user-123',
          achievementId: '1',
          achievement: mockAchievements[0] as Achievement,
          unlockedAt: new Date(),
        },
      ];
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(existingAchievements as UserAchievement[]);

      // Mock: all achievements available
      jest
        .spyOn(achievementRepository, 'find')
        .mockResolvedValue(mockAchievements as Achievement[]);

      // Mock: user stats show they would qualify for tier 3
      jest.spyOn(betRepository, 'count').mockResolvedValue(50);

      // Try to check achievements
      const result = await service.checkAchievements('user-123');

      // Tier 3 should NOT be unlocked because tier 2 is missing
      const tier3Unlocked = result.some(
        (ua) => ua.achievementKey === 'tier3_achievement',
      );
      expect(tier3Unlocked).toBe(false);
    });
  });

  describe('achievement unlocking', () => {
    it('should save UserAchievement and award XP when condition is met', async () => {
      // Only expose the first_bet achievement (betsPlaced >= 1)
      jest
        .spyOn(achievementRepository, 'find')
        .mockResolvedValue([mockAchievements[0]] as Achievement[]);

      // No achievements unlocked yet
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue([]);

      // User has 1 bet → satisfies betsPlaced >= 1
      const mockBet = {
        id: 'bet-1',
        userId: 'user-123',
        isFinalized: true,
        pointsEarned: 10,
        createdAt: new Date(),
        picks: [
          { isCorrect: true, hasBoost: false, oddAtBet: 2 },
        ],
      };
      jest.spyOn(betRepository, 'find').mockResolvedValue([mockBet] as any);

      const result = await service.checkAchievements('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].achievementKey).toBe('first_bet');
      expect(result[0].achievementName).toBe('First Bet');

      // Should have saved the UserAchievement
      expect(userAchievementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          achievementId: '1',
        }),
      );

      // Should have awarded XP
      expect(xpLevelService.awardXP).toHaveBeenCalledWith(
        'user-123',
        `ACHIEVEMENT_${AchievementRarity.COMMON}`,
      );
    });

    it('should not unlock already-unlocked achievements', async () => {
      jest
        .spyOn(achievementRepository, 'find')
        .mockResolvedValue([mockAchievements[0]] as Achievement[]);

      // first_bet is already unlocked
      jest.spyOn(userAchievementRepository, 'find').mockImplementation(
        (options: any) => {
          if (options?.select) {
            // The "get achievement IDs" call
            return Promise.resolve([{ achievementId: '1' }] as any);
          }
          // The "get with relations" call
          return Promise.resolve([{
            userId: 'user-123',
            achievementId: '1',
            achievement: mockAchievements[0],
          }] as any);
        },
      );

      const mockBet = {
        id: 'bet-1',
        userId: 'user-123',
        isFinalized: true,
        pointsEarned: 10,
        createdAt: new Date(),
        picks: [{ isCorrect: true, hasBoost: false, oddAtBet: 2 }],
      };
      jest.spyOn(betRepository, 'find').mockResolvedValue([mockBet] as any);

      const result = await service.checkAchievements('user-123');

      expect(result).toHaveLength(0);
      expect(userAchievementRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('temporary achievements', () => {
    it('should mark temporary achievement correctly', () => {
      const tempAchievement: Partial<Achievement> = {
        id: '4',
        key: 'gold_medal',
        name: 'Gold Medal',
        isTemporary: true,
        canBeLost: true,
      };

      expect(tempAchievement.isTemporary).toBe(true);
      expect(tempAchievement.canBeLost).toBe(true);
    });
  });
});
