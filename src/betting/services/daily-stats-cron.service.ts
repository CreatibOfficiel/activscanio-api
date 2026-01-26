import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DailyStatsTrackerService } from './daily-stats-tracker.service';

@Injectable()
export class DailyStatsCronService {
  private readonly logger = new Logger(DailyStatsCronService.name);

  constructor(private readonly dailyStatsTracker: DailyStatsTrackerService) {}

  /**
   * Exécuté chaque jour à 3h du matin (Europe/Paris)
   * Agrège les stats de la veille
   */
  @Cron('0 3 * * *', {
    name: 'aggregate-daily-stats',
    timeZone: 'Europe/Paris',
  })
  async handleDailyAggregation() {
    this.logger.log('🔄 Running daily stats aggregation cron job');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      await this.dailyStatsTracker.aggregateStatsForDate(yesterday);

      this.logger.log('✅ Daily stats aggregation completed successfully');
    } catch (error) {
      this.logger.error('❌ Error during daily stats aggregation', error);
    }
  }

  /**
   * Méthode manuelle pour tester l'agrégation
   * Peut être appelée via un endpoint admin pour tests
   */
  async triggerManualAggregation(date?: Date): Promise<void> {
    this.logger.log(
      `📊 Manual aggregation triggered for ${date ? date.toISOString() : 'yesterday'}`,
    );

    const targetDate =
      date ||
      (() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        return yesterday;
      })();

    await this.dailyStatsTracker.aggregateStatsForDate(targetDate);

    this.logger.log('✅ Manual aggregation completed');
  }

  /**
   * Backfill pour plusieurs jours (optionnel)
   */
  async backfillRange(startDate: Date, endDate: Date): Promise<void> {
    this.logger.log(
      `🔄 Backfilling stats from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    await this.dailyStatsTracker.backfillHistoricalStats(startDate, endDate);

    this.logger.log('✅ Backfill completed');
  }
}
