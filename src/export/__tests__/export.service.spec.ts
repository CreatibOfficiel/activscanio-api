/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from '../export.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAchievement } from '../../achievements/entities/user-achievement.entity';
import { User } from '../../users/user.entity';

describe('ExportService', () => {
  let service: ExportService;
  let userAchievementRepository: Repository<UserAchievement>;
  let userRepository: Repository<User>;

  const mockUser = {
    id: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    level: 10,
    xp: 5000,
    currentTitle: 'Pro Bettor',
    achievementCount: 15,
  };

  const mockAchievements = [
    {
      id: 'ua-1',
      userId: 'user-123',
      unlockedAt: new Date('2024-01-01'),
      achievement: {
        key: 'first_bet',
        name: 'First Bet',
        description: 'Place your first bet',
        category: 'BETTING',
        rarity: 'COMMON',
        xpReward: 10,
        icon: '🎯',
        tierLevel: 1,
        chainName: null,
      },
    },
    {
      id: 'ua-2',
      userId: 'user-123',
      unlockedAt: new Date('2024-01-15'),
      achievement: {
        key: 'perfect_podium',
        name: 'Perfect Podium',
        description: 'Get a perfect score',
        category: 'PRECISION',
        rarity: 'RARE',
        xpReward: 100,
        icon: '🏆',
        tierLevel: 1,
        chainName: 'perfect_podium_chain',
      },
    },
  ];

  const mockBets = [
    {
      id: 'bet-1',
      userId: 'user-123',
      createdAt: new Date('2024-01-10'),
      isFinalized: true,
      pointsEarned: 45,
      bettingWeek: {
        weekNumber: 1,
        year: 2024,
      },
    },
    {
      id: 'bet-2',
      userId: 'user-123',
      createdAt: new Date('2024-01-17'),
      isFinalized: true,
      pointsEarned: 60,
      bettingWeek: {
        weekNumber: 2,
        year: 2024,
      },
    },
    {
      id: 'bet-3',
      userId: 'user-123',
      createdAt: new Date('2024-01-24'),
      isFinalized: false,
      pointsEarned: null,
      bettingWeek: {
        weekNumber: 3,
        year: 2024,
      },
    },
  ];

  const mockRankings = [
    {
      id: 'rank-1',
      userId: 'user-123',
      month: 1,
      year: 2024,
      rank: 5,
      totalPoints: 450,
      betsPlaced: 10,
      betsWon: 7,
      perfectBets: 2,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: getRepositoryToken(UserAchievement),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
    userAchievementRepository = module.get<Repository<UserAchievement>>(
      getRepositoryToken(UserAchievement),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportAchievementsToCSV', () => {
    it('should export achievements to CSV format', async () => {
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);

      const csv = await service.exportAchievementsToCSV('user-123');

      expect(csv).toContain('"Name"');
      expect(csv).toContain('"Description"');
      expect(csv).toContain('"Category"');
      expect(csv).toContain('"Rarity"');
      expect(csv).toContain('First Bet');
      expect(csv).toContain('Perfect Podium');
      expect(csv).toContain('COMMON');
      expect(csv).toContain('RARE');
      expect(userAchievementRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        relations: ['achievement'],
        order: { unlockedAt: 'DESC' },
      });
    });

    it('should handle empty achievements', async () => {
      jest.spyOn(userAchievementRepository, 'find').mockResolvedValue([]);

      const csv = await service.exportAchievementsToCSV('user-123');

      expect(csv).toContain('"Name"');
      expect(csv.split('\n').length).toBe(1); // Only header
    });

    it('should include all achievement fields in CSV', async () => {
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue([mockAchievements[0]] as any);

      const csv = await service.exportAchievementsToCSV('user-123');

      expect(csv).toContain('XP Reward');
      expect(csv).toContain('Unlocked At');
      expect(csv).toContain('Tier Level');
      expect(csv).toContain('Chain Name');
      expect(csv).toContain('Temporary');
    });
  });

  describe('exportStatsToJSON', () => {
    it('should export comprehensive stats to JSON', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);

      const json = await service.exportStatsToJSON('user-123');

      expect(json).toHaveProperty('user');
      expect(json.user).toEqual({
        userId: 'user-123',
        level: 10,
        xp: 5000,
        currentTitle: 'Pro Bettor',
        achievementCount: 15,
      });
    });

    it('should include achievements breakdown by rarity', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);

      const json = await service.exportStatsToJSON('user-123');

      expect(json.stats.achievements.byRarity).toEqual({
        common: 1,
        rare: 1,
        epic: 0,
        legendary: 0,
      });
    });

    it('should include achievements breakdown by category', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);

      const json = await service.exportStatsToJSON('user-123');

      expect(json.stats.achievements.byCategory).toEqual({
        BETTING: 1,
        PRECISION: 1,
      });
    });

    it('should include export metadata', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);

      const json = await service.exportStatsToJSON('user-123');

      expect(json.exportMetadata).toHaveProperty('exportedAt');
      expect(json.exportMetadata).toHaveProperty('version', '1.0');
      expect(json.exportMetadata).toHaveProperty(
        'source',
        'ActivScanIO Export API',
      );
    });

    it('should throw error if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.exportStatsToJSON('user-999')).rejects.toThrow(
        'User not found',
      );
    });
  });
});
