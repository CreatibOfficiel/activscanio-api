/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
/**
 * TasksService
 *
 * Orchestrates all scheduled tasks for the betting system.
 *
 * Weekly Tasks:
 * - Monday 00:00: Reset weekly activity flags
 * - Monday 00:05: Create new betting week
 * - Thursday 23:59: Close current week
 * - Sunday 20:00: Determine podium + finalize week + calculate points
 * - Sunday 20:03: Recalculate monthly rankings
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
import { RankingsService } from '../betting/services/rankings.service';
import { OddsCalculatorService } from '../betting/services/odds-calculator.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { CompetitorRepository } from '../competitors/repositories/competitor.repository';
import { CompetitorEloSnapshotRepository } from '../competitors/repositories/competitor-elo-snapshot.repository';
import { Competitor } from '../competitors/competitor.entity';
import { CompetitorMonthlyStats } from '../betting/entities/competitor-monthly-stats.entity';
import {
  BettingWeek,
  BettingWeekStatus,
} from '../betting/entities/betting-week.entity';
import { RaceResult } from '../races/race-result.entity';
import { User } from '../users/user.entity';
import { SeasonsService } from '../seasons/seasons.service';
import { StreakTrackerService } from '../achievements/services/streak-tracker.service';
import { StreakWarningService } from '../achievements/services/streak-warning.service';
import { ELIGIBILITY_RULES } from '../betting/config/odds-calculator.config';
import {
  BETTING_CRON_SCHEDULES,
  TASK_EXECUTION_CONFIG,
  TASK_DESCRIPTIONS,
  PODIUM_DETERMINATION_CONFIG,
} from './config/tasks.config';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly runningTasks = new Set<string>();

  /**
   * Acquire a lock for a task. Returns false if already running.
   */
  private acquireTaskLock(taskName: string): boolean {
    if (this.runningTasks.has(taskName)) {
      this.logger.warn(`Task "${taskName}" is already running — skipping`);
      return false;
    }
    this.runningTasks.add(taskName);
    return true;
  }

  private releaseTaskLock(taskName: string): void {
    this.runningTasks.delete(taskName);
  }

  constructor(
    private readonly weekManagerService: WeekManagerService,
    private readonly bettingFinalizerService: BettingFinalizerService,
    private readonly rankingsService: RankingsService,
    private readonly oddsCalculatorService: OddsCalculatorService,
    private readonly competitorsService: CompetitorsService,
    private readonly competitorRepo: CompetitorRepository,
    private readonly competitorEloSnapshotRepo: CompetitorEloSnapshotRepository,
    private readonly seasonsService: SeasonsService,
    private readonly streakTrackerService: StreakTrackerService,
    private readonly streakWarningService: StreakWarningService,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(CompetitorMonthlyStats)
    private readonly competitorMonthlyStatsRepository: Repository<CompetitorMonthlyStats>,
    @InjectRepository(RaceResult)
    private readonly raceResultRepository: Repository<RaceResult>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
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
      // Auto-finalize past calibration weeks before creating the new one
      const finalized = await this.bettingWeekRepository
        .createQueryBuilder()
        .update(BettingWeek)
        .set({
          status: BettingWeekStatus.FINALIZED,
          finalizedAt: new Date(),
        })
        .where('status = :status AND "endDate" < NOW()', {
          status: BettingWeekStatus.CALIBRATION,
        })
        .execute();

      if (finalized.affected && finalized.affected > 0) {
        this.logger.log(
          `Auto-finalized ${finalized.affected} past calibration week(s)`,
        );
      }

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
   * Runs every Thursday at 23:59 UTC
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
   * Runs every Sunday at 20:00 UTC
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

    if (!this.acquireTaskLock('finalize-week')) return;

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.finalizeWeek}`);

    try {
      const currentWeek = await this.weekManagerService.getCurrentWeek();

      if (!currentWeek) {
        this.logger.warn('No current week found to finalize');
        return;
      }

      // 1. Recalculate odds with up-to-date data before finalization (M3)
      try {
        await this.oddsCalculatorService.calculateOddsForWeek(currentWeek.id);
        this.logger.log('Odds recalculated before finalization');
      } catch (error) {
        this.logger.error(
          `Failed to recalculate odds before finalization: ${error.message}`,
          error.stack,
        );
      }

      // 2. Determine podium
      const podium = await this.determinePodium(currentWeek);

      if (!podium) {
        this.logger.warn(
          'Could not determine podium (insufficient competitors) — cancelling week bets',
        );
        // Cancel all pending bets for this week so they don't stay stuck
        await this.weekManagerService.cancelWeek(currentWeek.id);
        return;
      }

      this.logger.log(
        `Podium determined: [${podium[0].firstName} ${podium[0].lastName}, ${podium[1].firstName} ${podium[1].lastName}, ${podium[2].firstName} ${podium[2].lastName}]`,
      );

      // 3. Finalize week with podium
      await this.weekManagerService.finalizeWeek(currentWeek.id, [
        podium[0].id,
        podium[1].id,
        podium[2].id,
      ]);

      // 4. Calculate points for all bets
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
    } finally {
      this.releaseTaskLock('finalize-week');
    }
  }

  /**
   * Recalculate monthly rankings
   * Runs every Sunday at 20:03 UTC
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

    if (!this.acquireTaskLock('recalculate-rankings')) return;

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
    } finally {
      this.releaseTaskLock('recalculate-rankings');
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

    if (!this.acquireTaskLock('reset-monthly-stats')) return;

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
    } finally {
      this.releaseTaskLock('reset-monthly-stats');
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

  /* ==================== RANK SNAPSHOT TASKS ==================== */

  /**
   * Snapshot competitor ranks (daily)
   * Runs every weekday (Mon-Fri) at 00:00 UTC
   * Saves current rank based on conservativeScore for trend calculation
   */
  @Cron(BETTING_CRON_SCHEDULES.SNAPSHOT_COMPETITOR_RANKS, {
    name: 'snapshot-competitor-ranks',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleSnapshotCompetitorRanks(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.snapshotCompetitorRanks) {
      this.logger.warn('Task "snapshot-competitor-ranks" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.snapshotCompetitorRanks}`,
    );

    try {
      await this.competitorRepo.snapshotDailyRanks();
      this.logger.log('✅ Competitor ranks snapshotted successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to snapshot competitor ranks: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Snapshot bettor ranks (weekly)
   * Runs every Sunday at 23:59 UTC (after RECALCULATE_RANKINGS at 23:58)
   * Saves current rank based on totalPoints for trend calculation
   */
  @Cron(BETTING_CRON_SCHEDULES.SNAPSHOT_BETTOR_RANKS, {
    name: 'snapshot-bettor-ranks',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleSnapshotBettorRanks(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.snapshotBettorRanks) {
      this.logger.warn('Task "snapshot-bettor-ranks" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.snapshotBettorRanks}`,
    );

    try {
      await this.rankingsService.snapshotWeeklyRanks();
      this.logger.log('✅ Bettor ranks snapshotted successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to snapshot bettor ranks: ${error.message}`,
        error.stack,
      );
    }
  }

  /* ==================== STREAK WARNING TASKS ==================== */

  /**
   * Betting streak warning (early)
   * Runs every Wednesday at 10:00 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.BETTING_STREAK_WARNING_EARLY, {
    name: 'betting-streak-warning-early',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleBettingStreakWarningEarly(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.bettingStreakWarningEarly) {
      this.logger.warn('Task "betting-streak-warning-early" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.bettingStreakWarningEarly}`,
    );

    try {
      const warned =
        await this.streakWarningService.checkBettingStreakWarnings('early');
      this.logger.log(`✅ Betting streak warning (early): ${warned} users warned`);
    } catch (error) {
      this.logger.error(
        `❌ Failed betting streak warning (early): ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Betting streak warning (urgent)
   * Runs every Thursday at 10:00 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.BETTING_STREAK_WARNING_URGENT, {
    name: 'betting-streak-warning-urgent',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleBettingStreakWarningUrgent(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.bettingStreakWarningUrgent) {
      this.logger.warn('Task "betting-streak-warning-urgent" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.bettingStreakWarningUrgent}`,
    );

    try {
      const warned =
        await this.streakWarningService.checkBettingStreakWarnings('urgent');
      this.logger.log(
        `✅ Betting streak warning (urgent): ${warned} users warned`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed betting streak warning (urgent): ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Play streak warning
   * Runs every weekday (Mon-Fri) at 09:00 UTC
   */
  @Cron(BETTING_CRON_SCHEDULES.PLAY_STREAK_WARNING, {
    name: 'play-streak-warning',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handlePlayStreakWarning(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.playStreakWarning) {
      this.logger.warn('Task "play-streak-warning" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.playStreakWarning}`,
    );

    try {
      const warned =
        await this.streakWarningService.checkPlayStreakWarnings();
      this.logger.log(`✅ Play streak warning: ${warned} users warned`);
    } catch (error) {
      this.logger.error(
        `❌ Failed play streak warning: ${error.message}`,
        error.stack,
      );
    }
  }

  /* ==================== ELO SNAPSHOT TASK ==================== */

  /**
   * Snapshot competitor ELO (daily)
   * Runs every day at 00:01 UTC
   * Saves current rating/rd/vol for each competitor for the ELO history chart
   */
  @Cron(BETTING_CRON_SCHEDULES.SNAPSHOT_COMPETITOR_ELO, {
    name: 'snapshot-competitor-elo',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleSnapshotCompetitorElo(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.snapshotCompetitorElo) {
      this.logger.warn('Task "snapshot-competitor-elo" is disabled');
      return;
    }

    if (!this.acquireTaskLock('snapshot-competitor-elo')) return;

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.snapshotCompetitorElo}`,
    );

    try {
      const competitors = await this.competitorRepository.find();
      const today = new Date().toISOString().split('T')[0];
      let count = 0;

      for (const competitor of competitors) {
        await this.competitorEloSnapshotRepo.upsertSnapshot({
          competitorId: competitor.id,
          date: today,
          rating: competitor.rating,
          rd: competitor.rd,
          vol: competitor.vol,
          raceCount: competitor.raceCount,
        });
        count++;
      }

      this.logger.log(
        `✅ ELO snapshots saved for ${count} competitors (date: ${today})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to snapshot competitor ELO: ${error.message}`,
        error.stack,
      );
      await this.retryTask(() => this.handleSnapshotCompetitorElo());
    } finally {
      this.releaseTaskLock('snapshot-competitor-elo');
    }
  }

  /* ==================== HELPER METHODS ==================== */

  /**
   * Determine the top 3 competitors for a week (podium)
   *
   * Algorithm:
   * 1. Filter eligible competitors (same criteria as odds: lifetime races + 30-day activity)
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

    // Apply the same eligibility criteria as odds calculation:
    // 1. Calibration: totalLifetimeRaces >= MIN_LIFETIME_RACES
    // 2. Recent activity: >= MIN_RECENT_RACES in last RECENT_WINDOW_DAYS (30 days)
    const windowStart = new Date();
    windowStart.setDate(
      windowStart.getDate() - ELIGIBILITY_RULES.RECENT_WINDOW_DAYS,
    );

    const eligibilityChecks = await Promise.all(
      allCompetitors.map(async (competitor) => {
        // Rule 1: Calibration
        if (
          competitor.totalLifetimeRaces < ELIGIBILITY_RULES.MIN_LIFETIME_RACES
        ) {
          return { competitor, isEligible: false };
        }

        // Rule 2: Recent activity (rolling 30-day window)
        const recentRacesCount = await this.raceResultRepository
          .createQueryBuilder('result')
          .innerJoin('result.race', 'race')
          .where('result.competitorId = :competitorId', {
            competitorId: competitor.id,
          })
          .andWhere('race.date >= :windowStart', { windowStart })
          .getCount();

        if (recentRacesCount < ELIGIBILITY_RULES.MIN_RECENT_RACES) {
          return { competitor, isEligible: false };
        }

        return { competitor, isEligible: true };
      }),
    );

    const eligibleCompetitors = eligibilityChecks
      .filter((c) => c.isEligible)
      .map((c) => c.competitor);

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
