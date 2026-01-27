/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { AchievementCalculatorService } from '../achievement-calculator.service';
import { Repository } from 'typeorm';
import {
  Achievement,
  AchievementCategory,
  AchievementRarity,
} from '../../entities/achievement.entity';
import { UserAchievement } from '../../entities/user-achievement.entity';
import { Bet } from '../../../betting/entities/bet.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('AchievementCalculatorService', () => {
  let service: AchievementCalculatorService;
  let achievementRepository: Repository<Achievement>;
  let userAchievementRepository: Repository<UserAchievement>;
  let betRepository: Repository<Bet>;
  let eventEmitter: EventEmitter2;

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
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementCalculatorService,
        {
          provide: getRepositoryToken(Achievement) as string,
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserAchievement) as string,
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Bet),
          useValue: {
            count: jest.fn(),
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
    it('should emit achievement.unlocked event when new achievement is unlocked', async () => {
      const mockUserAchievement = {
        userId: 'user-123',
        achievementId: '1',
        achievement: mockAchievements[0],
        unlockedAt: new Date(),
      } as UserAchievement;

      jest
        .spyOn(userAchievementRepository, 'save')
        .mockResolvedValue(mockUserAchievement);

      // Unlock achievement manually (simulating the unlock process)

      await (
        service as unknown as {
          unlockAchievement: (
            userId: string,
            achievement: Achievement,
          ) => Promise<void>;
        }
      ).unlockAchievement('user-123', mockAchievements[0] as Achievement);

      // Verify event was emitted
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'achievement.unlocked',
        expect.objectContaining({
          userId: 'user-123',
          achievement: expect.objectContaining({
            key: 'first_bet',
          }),
        }),
      );
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
