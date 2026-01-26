import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parser } from 'json2csv';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { User } from '../users/user.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BettorRanking)
    private readonly rankingRepository: Repository<BettorRanking>,
  ) {}

  /**
   * Export user's achievements to CSV
   */
  async exportAchievementsToCSV(userId: string): Promise<string> {
    const achievements = await this.userAchievementRepository.find({
      where: { userId },
      relations: ['achievement'],
      order: { unlockedAt: 'DESC' },
    });

    const data = achievements.map((ua) => ({
      Name: ua.achievement.name,
      Description: ua.achievement.description,
      Category: ua.achievement.category,
      Rarity: ua.achievement.rarity,
      'XP Reward': ua.achievement.xpReward,
      'Unlocked At': ua.unlockedAt.toISOString(),
      'Tier Level': ua.achievement.tierLevel || 0,
      'Chain Name': ua.achievement.chainName || '-',
      Temporary: ua.achievement.isTemporary ? 'Yes' : 'No',
    }));

    const parser = new Parser({
      fields: [
        'Name',
        'Description',
        'Category',
        'Rarity',
        'XP Reward',
        'Unlocked At',
        'Tier Level',
        'Chain Name',
        'Temporary',
      ],
    });
    return parser.parse(data);
  }

  /**
   * Export user's betting history to CSV
   */
  async exportBettingHistoryToCSV(userId: string): Promise<string> {
    const bets = await this.betRepository.find({
      where: { userId },
      relations: ['bettingWeek'],
      order: { createdAt: 'DESC' },
      take: 500, // Last 500 bets
    });

    const data = bets.map((bet) => ({
      'Betting Week': `Week ${bet.bettingWeek?.weekNumber || '-'}`,
      Year: bet.bettingWeek?.year || '-',
      'Points Earned': bet.pointsEarned || 0,
      'Created At': bet.createdAt.toISOString(),
      Status: bet.isFinalized ? 'Finalized' : 'Pending',
    }));

    const parser = new Parser({
      fields: ['Betting Week', 'Year', 'Points Earned', 'Created At', 'Status'],
    });
    return parser.parse(data);
  }

  /**
   * Export complete user stats to JSON
   */
  async exportStatsToJSON(userId: string): Promise<any> {
    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get achievements
    const achievements = await this.userAchievementRepository.find({
      where: { userId },
      relations: ['achievement'],
    });

    // Get betting history (last 100)
    const bets = await this.betRepository.find({
      where: { userId },
      relations: ['bettingWeek'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    // Get rankings history (last 12 months)
    const rankings = await this.rankingRepository.find({
      where: { userId },
      order: { month: 'DESC', year: 'DESC' },
      take: 12,
    });

    // Calculate stats from bets
    const totalBetsPlaced = bets.length;
    const finalizedBets = bets.filter((b) => b.isFinalized);
    const betsWon = finalizedBets.filter(
      (b) => b.pointsEarned && b.pointsEarned > 0,
    ).length;
    const totalPoints = finalizedBets.reduce(
      (sum, b) => sum + (b.pointsEarned || 0),
      0,
    );
    const winRate =
      finalizedBets.length > 0 ? (betsWon / finalizedBets.length) * 100 : 0;

    return {
      user: {
        userId,
        level: user.level,
        xp: user.xp,
        currentTitle: user.currentTitle,
        achievementCount: user.achievementCount,
      },
      stats: {
        lifetime: {
          totalBetsPlaced,
          totalBetsWon: betsWon,
          winRate: parseFloat(winRate.toFixed(2)),
          totalPoints,
        },
        achievements: {
          total: achievements.length,
          byRarity: {
            common: achievements.filter(
              (a) => a.achievement.rarity === 'COMMON',
            ).length,
            rare: achievements.filter((a) => a.achievement.rarity === 'RARE')
              .length,
            epic: achievements.filter((a) => a.achievement.rarity === 'EPIC')
              .length,
            legendary: achievements.filter(
              (a) => a.achievement.rarity === 'LEGENDARY',
            ).length,
          },
          byCategory: achievements.reduce(
            (acc, a) => {
              acc[a.achievement.category] =
                (acc[a.achievement.category] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
        },
      },
      recentBets: bets.map((bet) => ({
        weekNumber: bet.bettingWeek?.weekNumber,
        year: bet.bettingWeek?.year,
        pointsEarned: bet.pointsEarned,
        createdAt: bet.createdAt,
        isFinalized: bet.isFinalized,
      })),
      rankingsHistory: rankings.map((ranking) => ({
        month: ranking.month,
        year: ranking.year,
        rank: ranking.rank,
        totalPoints: ranking.totalPoints,
      })),
      achievements: achievements.map((ua) => ({
        key: ua.achievement.key,
        name: ua.achievement.name,
        rarity: ua.achievement.rarity,
        category: ua.achievement.category,
        xpReward: ua.achievement.xpReward,
        unlockedAt: ua.unlockedAt,
        tierLevel: ua.achievement.tierLevel,
        chainName: ua.achievement.chainName,
      })),
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        source: 'ActivScanIO Export API',
      },
    };
  }

  /**
   * Export rankings leaderboard to CSV (for admin/public use)
   */
  async exportLeaderboardToCSV(
    month: number,
    year: number,
    limit: number = 100,
  ): Promise<string> {
    const rankings = await this.rankingRepository.find({
      where: { month, year },
      order: { rank: 'ASC' },
      take: limit,
    });

    const data = rankings.map((ranking) => ({
      Rank: ranking.rank,
      'User ID': ranking.userId,
      Points: ranking.totalPoints,
      'Bets Placed': ranking.betsPlaced || 0,
      'Win Rate':
        ranking.betsPlaced > 0
          ? `${((ranking.betsWon / ranking.betsPlaced) * 100).toFixed(2)}%`
          : '-',
      'Perfect Bets': ranking.perfectBets || 0,
    }));

    const parser = new Parser({
      fields: [
        'Rank',
        'User ID',
        'Points',
        'Bets Placed',
        'Win Rate',
        'Perfect Bets',
      ],
    });
    return parser.parse(data);
  }
}
