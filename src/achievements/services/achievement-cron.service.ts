import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TemporaryAchievementService } from './temporary-achievement.service';

/**
 * AchievementCronService
 *
 * Handles scheduled tasks for checking and updating temporary achievements.
 *
 * Scheduled Jobs:
 * - Daily (2 AM): Check performance-based and streak-based achievements
 * - Monthly (1st at 3 AM): Check ranking-based achievements
 */
@Injectable()
export class AchievementCronService {
  private readonly logger = new Logger(AchievementCronService.name);

  constructor(
    private readonly temporaryAchievementService: TemporaryAchievementService,
  ) {}

  /**
   * Daily cron job to check temporary achievements
   * Runs every day at 2:00 AM
   *
   * Checks:
   * - Performance achievements (rolling 30-day winrate)
   * - Streak achievements (consecutive weekly participation)
   */
  @Cron('0 2 * * *', {
    name: 'daily-temporary-achievements-check',
    timeZone: 'Europe/Paris',
  })
  async checkDailyTemporaryAchievements(): Promise<void> {
    this.logger.log('Starting daily temporary achievements check...');

    const startTime = Date.now();

    try {
      await this.temporaryAchievementService.checkAllUsersTemporaryAchievements();

      const duration = Date.now() - startTime;
      this.logger.log(
        `Daily temporary achievements check completed in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Error during daily temporary achievements check: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Monthly cron job to check ranking-based achievements
   * Runs on the 1st of each month at 3:00 AM
   *
   * Checks:
   * - Ranking medals (bronze/silver/gold) based on previous month rankings
   *
   * Note: This runs on the 1st to give time for final rankings to be calculated
   * after the last week of the previous month is finalized.
   */
  @Cron('0 3 1 * *', {
    name: 'monthly-ranking-achievements-check',
    timeZone: 'Europe/Paris',
  })
  async checkMonthlyRankingAchievements(): Promise<void> {
    this.logger.log('Starting monthly ranking achievements check...');

    const startTime = Date.now();

    try {
      // We only check ranking achievements here since they're month-specific
      // The checkAllUsersTemporaryAchievements already handles this, but we
      // can be more explicit to ensure rankings are fresh for the new month
      await this.temporaryAchievementService.checkAllUsersTemporaryAchievements();

      const duration = Date.now() - startTime;
      this.logger.log(
        `Monthly ranking achievements check completed in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Error during monthly ranking achievements check: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manual trigger for temporary achievements check
   * Can be called via admin endpoint if needed
   */
  async manualCheckAllUsers(): Promise<void> {
    this.logger.log('Manual temporary achievements check triggered');
    await this.temporaryAchievementService.checkAllUsersTemporaryAchievements();
  }
}
