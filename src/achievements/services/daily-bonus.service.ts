import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from '../../users/user.entity';
import { DailyUserStats } from '../../betting/entities/daily-user-stats.entity';
import { XPLevelService } from './xp-level.service';
import { XPSource } from '../enums/xp-source.enum';
import { startOfDay, subDays, format } from 'date-fns';

@Injectable()
export class DailyBonusService {
  private readonly logger = new Logger(DailyBonusService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DailyUserStats)
    private readonly dailyStatsRepository: Repository<DailyUserStats>,
    private readonly xpLevelService: XPLevelService,
  ) {}

  /**
   * Check and award daily login bonus
   * Awards 5 XP once per day on first action
   *
   * @param userId - User ID
   * @returns True if bonus was awarded
   */
  async checkDailyLoginBonus(userId: string): Promise<boolean> {
    const today = startOfDay(new Date());

    // Check if user already has stats for today
    const todayStats = await this.dailyStatsRepository.findOne({
      where: {
        userId,
        date: today,
      },
    });

    // If stats exist, login bonus was already awarded
    if (todayStats) {
      return false;
    }

    // Award login bonus
    await this.xpLevelService.awardXP(
      userId,
      XPSource.DAILY_LOGIN_BONUS,
      null,
      null,
      'Daily login bonus',
    );

    this.logger.log(`Daily login bonus awarded to user ${userId}`);
    return true;
  }

  /**
   * Check and award daily first bet bonus
   * Awards 10 XP on first bet of the day
   *
   * @param userId - User ID
   * @returns True if bonus was awarded
   */
  async checkDailyFirstBetBonus(userId: string): Promise<boolean> {
    const today = startOfDay(new Date());

    // Get today's stats
    const todayStats = await this.dailyStatsRepository.findOne({
      where: {
        userId,
        date: today,
      },
    });

    // If no stats or no bets placed yet today
    if (!todayStats || todayStats.betsPlaced === 0) {
      // Award first bet bonus
      await this.xpLevelService.awardXP(
        userId,
        XPSource.DAILY_FIRST_BET_BONUS,
        null,
        null,
        'Daily first bet bonus',
      );

      this.logger.log(`Daily first bet bonus awarded to user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Check and award weekly streak bonus
   * Awards 50 XP if user has bet at least once every day for 5 consecutive days
   *
   * @param userId - User ID
   * @returns True if bonus was awarded
   */
  async checkWeeklyStreakBonus(userId: string): Promise<boolean> {
    const today = startOfDay(new Date());
    const fiveDaysAgo = subDays(today, 4); // Including today = 5 days

    // Get stats for last 5 days
    const recentStats = await this.dailyStatsRepository.find({
      where: {
        userId,
        date: MoreThanOrEqual(fiveDaysAgo),
      },
      order: {
        date: 'ASC',
      },
    });

    // Check if user has stats for 5 consecutive days with at least 1 bet each day
    if (recentStats.length === 5) {
      const allDaysHaveBets = recentStats.every((stat) => stat.betsPlaced > 0);

      if (allDaysHaveBets) {
        // Check if already awarded this bonus this week (prevent duplicate awards)
        const todayStats = recentStats.find(
          (stat) => stat.date.getTime() === today.getTime(),
        );

        // Simple check: if today's XP earned is > 0, we likely already gave bonuses
        // More robust: could track in separate table, but this is simpler
        if (todayStats && todayStats.xpEarned > 0) {
          // Award weekly streak bonus
          await this.xpLevelService.awardXP(
            userId,
            XPSource.WEEKLY_STREAK_BONUS,
            null,
            null,
            'Weekly streak bonus (5 days consecutive)',
          );

          this.logger.log(`Weekly streak bonus awarded to user ${userId}`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Track daily activity - creates or updates daily stats
   *
   * @param userId - User ID
   * @param betPlaced - Whether a bet was placed
   * @param betWon - Whether a bet was won
   * @param pointsEarned - Points earned
   * @param xpEarned - XP earned
   */
  async trackDailyActivity(
    userId: string,
    betPlaced: boolean = false,
    betWon: boolean = false,
    pointsEarned: number = 0,
    xpEarned: number = 0,
  ): Promise<void> {
    const today = startOfDay(new Date());

    // Find or create today's stats
    let stats = await this.dailyStatsRepository.findOne({
      where: {
        userId,
        date: today,
      },
    });

    if (!stats) {
      stats = this.dailyStatsRepository.create({
        userId,
        date: today,
        betsPlaced: 0,
        betsWon: 0,
        pointsEarned: 0,
        xpEarned: 0,
        achievementsUnlocked: 0,
      });
    }

    // Update stats
    if (betPlaced) {
      stats.betsPlaced += 1;
    }
    if (betWon) {
      stats.betsWon += 1;
    }
    stats.pointsEarned += pointsEarned;
    stats.xpEarned += xpEarned;

    await this.dailyStatsRepository.save(stats);

    this.logger.debug(
      `Daily stats updated for user ${userId}: ${stats.betsPlaced} bets, ${stats.pointsEarned} points, ${stats.xpEarned} XP`,
    );
  }

  /**
   * Track achievement unlock in daily stats
   *
   * @param userId - User ID
   */
  async trackAchievementUnlock(userId: string): Promise<void> {
    const today = startOfDay(new Date());

    let stats = await this.dailyStatsRepository.findOne({
      where: {
        userId,
        date: today,
      },
    });

    if (!stats) {
      stats = this.dailyStatsRepository.create({
        userId,
        date: today,
        betsPlaced: 0,
        betsWon: 0,
        pointsEarned: 0,
        xpEarned: 0,
        achievementsUnlocked: 0,
      });
    }

    stats.achievementsUnlocked += 1;
    await this.dailyStatsRepository.save(stats);
  }
}
