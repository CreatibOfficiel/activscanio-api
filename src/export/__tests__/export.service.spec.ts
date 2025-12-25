import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from '../export.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAchievement } from '../../achievements/entities/user-achievement.entity';
import { User } from '../../users/user.entity';
import { Bet } from '../../betting/entities/bet.entity';
import { BettorRanking } from '../../betting/entities/bettor-ranking.entity';

describe('ExportService', () => {
  let service: ExportService;
  let userAchievementRepository: Repository<UserAchievement>;
  let userRepository: Repository<User>;
  let betRepository: Repository<Bet>;
  let rankingRepository: Repository<BettorRanking>;

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
        {
          provide: getRepositoryToken(Bet),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BettorRanking),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
    userAchievementRepository = module.get<Repository<UserAchievement>>(
      getRepositoryToken(UserAchievement),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    betRepository = module.get<Repository<Bet>>(getRepositoryToken(Bet));
    rankingRepository = module.get<Repository<BettorRanking>>(
      getRepositoryToken(BettorRanking),
    );
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

  describe('exportBettingHistoryToCSV', () => {
    it('should export betting history to CSV', async () => {
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);

      const csv = await service.exportBettingHistoryToCSV('user-123');

      expect(csv).toContain('"Betting Week"');
      expect(csv).toContain('"Year"');
      expect(csv).toContain('"Points Earned"');
      expect(csv).toContain('Week 1');
      expect(csv).toContain('Week 2');
      expect(csv).toContain('45');
      expect(csv).toContain('60');
      expect(betRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        relations: ['bettingWeek'],
        order: { createdAt: 'DESC' },
        take: 500,
      });
    });

    it('should show correct status for finalized and pending bets', async () => {
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);

      const csv = await service.exportBettingHistoryToCSV('user-123');

      expect(csv).toContain('Finalized');
      expect(csv).toContain('Pending');
    });

    it('should limit to 500 bets', async () => {
      jest.spyOn(betRepository, 'find').mockResolvedValue([]);

      await service.exportBettingHistoryToCSV('user-123');

      expect(betRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        }),
      );
    });
  });

  describe('exportStatsToJSON', () => {
    it('should export comprehensive stats to JSON', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

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

    it('should calculate lifetime stats correctly', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

      const json = await service.exportStatsToJSON('user-123');

      expect(json.stats.lifetime).toEqual({
        totalBetsPlaced: 3,
        totalBetsWon: 2, // 2 finalized with points
        winRate: 100, // 2/2 finalized bets won
        totalPoints: 105, // 45 + 60
      });
    });

    it('should include achievements breakdown by rarity', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

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
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

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
      jest.spyOn(betRepository, 'find').mockResolvedValue(mockBets as any);
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

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

    it('should handle zero win rate correctly', async () => {
      const noBets = [];
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(userAchievementRepository, 'find')
        .mockResolvedValue(mockAchievements as any);
      jest.spyOn(betRepository, 'find').mockResolvedValue(noBets);
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

      const json = await service.exportStatsToJSON('user-123');

      expect(json.stats.lifetime.winRate).toBe(0);
    });
  });

  describe('exportLeaderboardToCSV', () => {
    it('should export leaderboard to CSV', async () => {
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

      const csv = await service.exportLeaderboardToCSV(1, 2024, 100);

      expect(csv).toContain('"Rank"');
      expect(csv).toContain('"User ID"');
      expect(csv).toContain('"Points"');
      expect(csv).toContain('5');
      expect(csv).toContain('user-123');
      expect(csv).toContain('450');
      expect(rankingRepository.find).toHaveBeenCalledWith({
        where: { month: 1, year: 2024 },
        order: { rank: 'ASC' },
        take: 100,
      });
    });

    it('should calculate win rate correctly', async () => {
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(mockRankings as any);

      const csv = await service.exportLeaderboardToCSV(1, 2024, 100);

      // 7 wins / 10 bets = 70%
      expect(csv).toContain('70.00%');
    });

    it('should show "-" for win rate if no bets placed', async () => {
      const rankingNoBets = [
        {
          ...mockRankings[0],
          betsPlaced: 0,
          betsWon: 0,
        },
      ];
      jest
        .spyOn(rankingRepository, 'find')
        .mockResolvedValue(rankingNoBets as any);

      const csv = await service.exportLeaderboardToCSV(1, 2024, 100);

      expect(csv).toContain('-');
    });

    it('should respect limit parameter', async () => {
      jest.spyOn(rankingRepository, 'find').mockResolvedValue([]);

      await service.exportLeaderboardToCSV(1, 2024, 50);

      expect(rankingRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    it('should default to 100 if no limit provided', async () => {
      jest.spyOn(rankingRepository, 'find').mockResolvedValue([]);

      await service.exportLeaderboardToCSV(1, 2024);

      expect(rankingRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });
});
