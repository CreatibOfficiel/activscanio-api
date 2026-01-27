/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
/**
 * TasksService
 *
 * Orchestrates all scheduled tasks for the betting system.
 *
 * Weekly Tasks:
 * - Monday 00:00: Create new betting week + reset weekly flags
 * - Sunday 23:50: Close current week
 * - Sunday 23:55: Determine podium + finalize week + calculate points
 * - Sunday 23:58: Recalculate monthly rankings
 *
 * Monthly Tasks:
 * - 1st 00:00: Reset ELO and race counts
 * - 1st 00:05: Archive monthly stats
 *
 * Design Principles:
 * - Robust error handling with retries
 * - Detailed logging for audit trail
 * - Idempotent operations (safe to run multiple times)
 * - Configurable enable/disable switches
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeekManagerService } from '../betting/services/week-manager.service';
import { BettingFinalizerService } from '../betting/services/betting-finalizer.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { Competitor } from '../competitors/competitor.entity';
import { CompetitorMonthlyStats } from '../betting/entities/competitor-monthly-stats.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { User } from '../users/user.entity';
import { SeasonsService } from '../seasons/seasons.service';
import { StreakTrackerService } from '../achievements/services/streak-tracker.service';
import {
  BETTING_CRON_SCHEDULES,
  TASK_EXECUTION_CONFIG,
  TASK_DESCRIPTIONS,
  PODIUM_DETERMINATION_CONFIG,
} from './config/tasks.config';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly weekManagerService: WeekManagerService,
    private readonly bettingFinalizerService: BettingFinalizerService,
    private readonly competitorsService: CompetitorsService,
    private readonly seasonsService: SeasonsService,
    private readonly streakTrackerService: StreakTrackerService,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(CompetitorMonthlyStats)
    private readonly competitorMonthlyStatsRepository: Repository<CompetitorMonthlyStats>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /* ==================== WEEKLY TASKS ==================== */

  /**
   * Create new betting week
   * Runs every Monday at 00:00 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.CREATE_WEEK, {
    name: 'create-week',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleCreateWeek(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.createWeek) {
      this.logger.warn('Task "create-week" is disabled');
      return;
    }

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.createWeek}`);

    try {
      const week = await this.weekManagerService.createCurrentWeek();
      this.logger.log(
        `✅ Week created successfully: ${week.year}-W${week.weekNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to create week: ${error.message}`,
        error.stack,
      );
      await this.retryTask(() => this.weekManagerService.createCurrentWeek());
    }
  }

  /**
   * Reset weekly activity flags
   * Runs every Monday at 00:05 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.RESET_WEEKLY_ACTIVITY, {
    name: 'reset-weekly-activity',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleResetWeeklyActivity(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.resetWeeklyActivity) {
      this.logger.warn('Task "reset-weekly-activity" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.resetWeeklyActivity}`,
    );

    try {
      await this.competitorsService.resetWeeklyActivity();
      this.logger.log('✅ Weekly activity flags reset successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to reset weekly activity: ${error.message}`,
        error.stack,
      );
      await this.retryTask(() => this.competitorsService.resetWeeklyActivity());
    }
  }

  /**
   * Close current betting week
   * Runs every Sunday at 23:50 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.CLOSE_WEEK, {
    name: 'close-week',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleCloseWeek(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.closeWeek) {
      this.logger.warn('Task "close-week" is disabled');
      return;
    }

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.closeWeek}`);

    try {
      const currentWeek = await this.weekManagerService.getCurrentWeek();

      if (!currentWeek) {
        this.logger.warn('No current week found to close');
        return;
      }

      await this.weekManagerService.closeWeek(currentWeek.id);
      this.logger.log(
        `✅ Week ${currentWeek.year}-W${currentWeek.weekNumber} closed successfully`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to close week: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Finalize betting week (determine podium + calculate points)
   * Runs every Sunday at 23:55 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.FINALIZE_WEEK, {
    name: 'finalize-week',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleFinalizeWeek(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.finalizeWeek) {
      this.logger.warn('Task "finalize-week" is disabled');
      return;
    }

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.finalizeWeek}`);

    try {
      const currentWeek = await this.weekManagerService.getCurrentWeek();

      if (!currentWeek) {
        this.logger.warn('No current week found to finalize');
        return;
      }

      // 1. Determine podium
      const podium = await this.determinePodium(currentWeek);

      if (!podium) {
        this.logger.warn(
          'Could not determine podium (insufficient competitors)',
        );
        return;
      }

      this.logger.log(
        `Podium determined: [${podium[0].firstName} ${podium[0].lastName}, ${podium[1].firstName} ${podium[1].lastName}, ${podium[2].firstName} ${podium[2].lastName}]`,
      );

      // 2. Finalize week with podium
      await this.weekManagerService.finalizeWeek(currentWeek.id, [
        podium[0].id,
        podium[1].id,
        podium[2].id,
      ]);

      // 3. Calculate points for all bets
      const result = await this.bettingFinalizerService.finalizeWeek(
        currentWeek.id,
      );

      this.logger.log(
        `✅ Week finalized: ${result.processedBets} bets processed, ${result.totalPointsDistributed.toFixed(2)} points distributed`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to finalize week: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Recalculate monthly rankings
   * Runs every Sunday at 23:58 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.RECALCULATE_RANKINGS, {
    name: 'recalculate-rankings',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleRecalculateRankings(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.recalculateRankings) {
      this.logger.warn('Task "recalculate-rankings" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.recalculateRankings}`,
    );

    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      await this.bettingFinalizerService.recalculateRanks(month, year);
      this.logger.log(`✅ Rankings recalculated for ${month}/${year}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to recalculate rankings: ${error.message}`,
        error.stack,
      );
    }
  }

  /* ==================== MONTHLY TASKS ==================== */

  /**
   * Archive previous season
   * Runs on 1st of every month at 00:01 UTC (BEFORE reset)
   */
  @Cron(BETTING_CRON_SCHEDULES.ARCHIVE_SEASON, {
    name: 'archive-season',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleArchiveSeason(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.archiveSeason) {
      this.logger.warn('Task "archive-season" is disabled');
      return;
    }

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.archiveSeason}`);

    try {
      const now = new Date();
      const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const year =
        now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

      await this.seasonsService.archiveSeason(previousMonth, year);
      this.logger.log(
        `✅ Season ${previousMonth}/${year} archived successfully`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to archive season: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Reset boost availability for all users
   * Runs on 1st of every month at 00:03 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.RESET_BOOST_AVAILABILITY, {
    name: 'reset-boost-availability',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleResetBoostAvailability(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.resetBoostAvailability) {
      this.logger.warn('Task "reset-boost-availability" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.resetBoostAvailability}`,
    );

    try {
      await this.userRepository.update(
        {},
        {
          lastBoostUsedMonth: null,
          lastBoostUsedYear: null,
        },
      );

      this.logger.log('✅ Boost availability reset for all users');
    } catch (error) {
      this.logger.error(
        `❌ Failed to reset boost availability: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Reset monthly streaks for all users
   * Runs on 1st of every month at 00:04 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.RESET_MONTHLY_STREAKS, {
    name: 'reset-monthly-streaks',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleResetMonthlyStreaks(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.resetMonthlyStreaks) {
      this.logger.warn('Task "reset-monthly-streaks" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.resetMonthlyStreaks}`,
    );

    try {
      const affectedUsers =
        await this.streakTrackerService.resetMonthlyStreaks();
      this.logger.log(
        `✅ Monthly streaks reset successfully for ${affectedUsers} users`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to reset monthly streaks: ${error.message}`,
        error.stack,
      );
      await this.retryTask(() =>
        this.streakTrackerService.resetMonthlyStreaks(),
      );
    }
  }

  /**
   * Reset monthly stats (ELO + race counts)
   * Runs on 1st of every month at 00:05 UTC (AFTER archiving)
   */
  @Cron(BETTING_CRON_SCHEDULES.RESET_MONTHLY_STATS, {
    name: 'reset-monthly-stats',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleResetMonthlyStats(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.resetMonthlyStats) {
      this.logger.warn('Task "reset-monthly-stats" is disabled');
      return;
    }

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.resetMonthlyStats}`);

    try {
      await this.competitorsService.resetMonthlyStats();
      this.logger.log('✅ Monthly stats reset successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to reset monthly stats: ${error.message}`,
        error.stack,
      );
      await this.retryTask(() => this.competitorsService.resetMonthlyStats());
    }
  }

  /**
   * Archive monthly stats (save snapshot before reset)
   * Runs on 1st of every month at 00:05 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.ARCHIVE_MONTHLY_STATS, {
    name: 'archive-monthly-stats',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleArchiveMonthlyStats(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.archiveMonthlyStats) {
      this.logger.warn('Task "archive-monthly-stats" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.archiveMonthlyStats}`,
    );

    try {
      await this.archiveMonthlyStats();
      this.logger.log('✅ Monthly stats archived successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to archive monthly stats: ${error.message}`,
        error.stack,
      );
    }
  }

  /* ==================== HELPER METHODS ==================== */

  /**
   * Determine the top 3 competitors for a week (podium)
   *
   * Algorithm:
   * 1. Filter eligible competitors (min 1 race this week)
   * 2. Score based on conservative score (rating - 2*rd)
   * 3. Sort by score descending
   * 4. Apply tie-breakers if needed
   * 5. Return top 3
   */
  private async determinePodium(
    week: BettingWeek,
  ): Promise<Competitor[] | null> {
    // Fetch all competitors
    const allCompetitors = await this.competitorRepository.find();

    // Filter eligible competitors
    const eligibleCompetitors = allCompetitors.filter(
      (c) => c.isActiveThisWeek,
    );

    if (eligibleCompetitors.length < 3) {
      this.logger.warn(
        `Insufficient eligible competitors for podium: ${eligibleCompetitors.length} (need 3)`,
      );
      return null;
    }

    // Score and sort competitors
    const scored = eligibleCompetitors.map((competitor) => ({
      competitor,
      score: this.calculatePodiumScore(competitor),
    }));

    // Sort by score descending
    scored.sort((a, b) => {
      // Primary: score
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      // Tie-breakers
      for (const tieBreaker of PODIUM_DETERMINATION_CONFIG.tieBreakers) {
        switch (tieBreaker) {
          case 'rating':
            if (a.competitor.rating !== b.competitor.rating) {
              return b.competitor.rating - a.competitor.rating;
            }
            break;
          case 'rd':
            if (a.competitor.rd !== b.competitor.rd) {
              return a.competitor.rd - b.competitor.rd; // Lower RD is better
            }
            break;
          case 'raceCount':
            if (a.competitor.raceCount !== b.competitor.raceCount) {
              return b.competitor.raceCount - a.competitor.raceCount;
            }
            break;
        }
      }

      return 0;
    });

    // Return top 3
    return [scored[0].competitor, scored[1].competitor, scored[2].competitor];
  }

  /**
   * Calculate podium score for a competitor
   */
  private calculatePodiumScore(competitor: Competitor): number {
    switch (PODIUM_DETERMINATION_CONFIG.scoringMethod) {
      case 'conservative':
        return competitor.rating - 2 * competitor.rd;
      case 'rating':
        return competitor.rating;
      case 'race_count':
        return competitor.currentMonthRaceCount;
      default:
        return competitor.rating - 2 * competitor.rd; // Default to conservative
    }
  }

  /**
   * Archive monthly stats for all competitors
   */
  private async archiveMonthlyStats(): Promise<void> {
    const now = new Date();
    const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const year =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    this.logger.log(`Archiving stats for ${previousMonth}/${year}`);

    const competitors = await this.competitorRepository.find();

    for (const competitor of competitors) {
      const stats = this.competitorMonthlyStatsRepository.create({
        competitorId: competitor.id,
        month: previousMonth,
        year,
        finalRating: competitor.rating,
        finalRd: competitor.rd,
        finalVol: competitor.vol,
        raceCount: competitor.raceCount,
        avgRank12: competitor.avgRank12,
        winStreak: competitor.winStreak,
      });

      await this.competitorMonthlyStatsRepository.save(stats);
    }

    this.logger.log(`Archived stats for ${competitors.length} competitors`);
  }

  /**
   * Retry a task with exponential backoff
   */
  private async retryTask(
    task: () => Promise<any>,
    attempt: number = 1,
  ): Promise<void> {
    if (attempt > TASK_EXECUTION_CONFIG.retry.maxAttempts) {
      this.logger.error(
        `Task failed after ${TASK_EXECUTION_CONFIG.retry.maxAttempts} attempts`,
      );
      return;
    }

    this.logger.log(`Retrying task (attempt ${attempt})...`);

    await new Promise((resolve) =>
      setTimeout(resolve, TASK_EXECUTION_CONFIG.retry.delayMs * attempt),
    );

    try {
      await task();
      this.logger.log(`Task succeeded on attempt ${attempt}`);
    } catch (error) {
      this.logger.error(`Retry ${attempt} failed: ${error.message}`);
      await this.retryTask(task, attempt + 1);
    }
  }
}
