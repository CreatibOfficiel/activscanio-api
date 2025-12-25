import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { DailyUserStats } from '../entities/daily-user-stats.entity';
import { Bet } from '../entities/bet.entity';
import { UserAchievement } from '../../achievements/entities/user-achievement.entity';

@Injectable()
export class DailyStatsTrackerService {
  private readonly logger = new Logger(DailyStatsTrackerService.name);

  constructor(
    @InjectRepository(DailyUserStats)
    private readonly dailyStatsRepository: Repository<DailyUserStats>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
  ) {}

  /**
   * Incrémente ou crée une entrée de stats quotidiennes
   */
  async incrementDailyStat(
    userId: string,
    date: Date,
    field: 'betsPlaced' | 'betsWon' | 'pointsEarned' | 'xpEarned' | 'achievementsUnlocked',
    value: number,
  ): Promise<void> {
    const dateStr = date.toISOString().split('T')[0]; // Format YYYY-MM-DD

    const existing = await this.dailyStatsRepository.findOne({
      where: { userId, date: new Date(dateStr) },
    });

    if (existing) {
      existing[field] += value;
      await this.dailyStatsRepository.save(existing);
    } else {
      const newStats = this.dailyStatsRepository.create({
        userId,
        date: new Date(dateStr),
        [field]: value,
      });
      await this.dailyStatsRepository.save(newStats);
    }
  }

  /**
   * Agrège les stats pour un jour donné (utilisé par cron job)
   */
  async aggregateStatsForDate(date: Date): Promise<void> {
    this.logger.log(`Aggregating stats for ${date.toISOString()}`);

    // Récupérer tous les utilisateurs actifs ce jour
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bets = await this.betRepository.find({
      where: {
        createdAt: Between(startOfDay, endOfDay),
      },
    });

    const userMap = new Map<string, {
      betsPlaced: number;
      betsWon: number;
      pointsEarned: number;
    }>();

    // Compter les paris par utilisateur
    for (const bet of bets) {
      if (!userMap.has(bet.userId)) {
        userMap.set(bet.userId, { betsPlaced: 0, betsWon: 0, pointsEarned: 0 });
      }
      const stats = userMap.get(bet.userId)!;
      stats.betsPlaced++;
      if (bet.pointsEarned && bet.pointsEarned > 0) {
        stats.betsWon++;
        stats.pointsEarned += bet.pointsEarned;
      }
    }

    // Compter les achievements débloqués
    const achievements = await this.userAchievementRepository.find({
      where: {
        unlockedAt: Between(startOfDay, endOfDay),
      },
    });

    const achievementMap = new Map<string, number>();
    for (const achievement of achievements) {
      achievementMap.set(
        achievement.userId,
        (achievementMap.get(achievement.userId) || 0) + 1,
      );
    }

    // Sauvegarder ou mettre à jour
    for (const [userId, stats] of userMap.entries()) {
      const dateStr = date.toISOString().split('T')[0];
      const existing = await this.dailyStatsRepository.findOne({
        where: { userId, date: new Date(dateStr) },
      });

      const achievementsUnlocked = achievementMap.get(userId) || 0;

      if (existing) {
        existing.betsPlaced = stats.betsPlaced;
        existing.betsWon = stats.betsWon;
        existing.pointsEarned = stats.pointsEarned;
        existing.achievementsUnlocked = achievementsUnlocked;
        await this.dailyStatsRepository.save(existing);
      } else {
        const newStats = this.dailyStatsRepository.create({
          userId,
          date: new Date(dateStr),
          betsPlaced: stats.betsPlaced,
          betsWon: stats.betsWon,
          pointsEarned: stats.pointsEarned,
          xpEarned: 0, // Calculé séparément si XP history existe
          achievementsUnlocked,
        });
        await this.dailyStatsRepository.save(newStats);
      }
    }

    this.logger.log(`Aggregated stats for ${userMap.size} users`);
  }

  /**
   * Backfill historique (optionnel - non utilisé selon plan)
   */
  async backfillHistoricalStats(startDate: Date, endDate: Date): Promise<void> {
    this.logger.log(`Backfilling stats from ${startDate} to ${endDate}`);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      await this.aggregateStatsForDate(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.logger.log('Backfill completed');
  }

  /**
   * Get daily stats for a user
   */
  async getDailyStats(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DailyUserStats[]> {
    return await this.dailyStatsRepository.find({
      where: {
        userId,
        date: Between(startDate, endDate),
      },
      order: {
        date: 'ASC',
      },
    });
  }

  /**
   * Get stats for a specific date
   */
  async getStatsForDate(userId: string, date: Date): Promise<DailyUserStats | null> {
    const dateStr = date.toISOString().split('T')[0];
    return await this.dailyStatsRepository.findOne({
      where: { userId, date: new Date(dateStr) },
    });
  }
}
