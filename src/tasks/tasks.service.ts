/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
/**
 * TasksService
 *
 * Orchestrates all scheduled tasks for the betting system.
 *
 * Weekly Tasks:
 * - Monday 00:00: Reset weekly activity flags
 * - Monday 00:05: Create new betting week (+ season transition if first week of season)
 * - Tuesday 00:00 (Monday midnight): Close current week
 * - Sunday 20:00: Determine podium + finalize week + calculate points
 * - Sunday 20:03: Recalculate season rankings
 *
 * Season transition (triggered by handleCreateWeek on first week of a 4-week season):
 * 1. Archive previous season
 * 2. Archive competitor monthly stats (ELO snapshot)
 * 3. Reset boost availability
 * 4. Reset monthly streaks
 * 5. Reset monthly stats (ELO + race counts)
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
import { WeekUtils } from '../common/utils/week-utils';
import { SeasonUtils } from '../common/utils/season-utils';
import { CompetitorsService } from '../competitors/competitors.service';
import { CompetitorRepository } from '../competitors/repositories/competitor.repository';
import { CompetitorEloSnapshotRepository } from '../competitors/repositories/competitor-elo-snapshot.repository';
import { Competitor } from '../competitors/competitor.entity';
import { CompetitorMonthlyStats } from '../competitors/entities/competitor-monthly-stats.entity';
import { RaceResult } from '../races/race-result.entity';
import { User } from '../users/user.entity';
import { SeasonsService } from '../seasons/seasons.service';
import { PingpongDecayService } from '../pingpong/services/pingpong-decay.service';
import { PingpongEligibilityService } from '../pingpong/services/pingpong-eligibility.service';
import { PingpongPlayer } from '../pingpong/entities/pingpong-player.entity';
import { StreakTrackerService } from '../achievements/services/streak-tracker.service';
import { StreakWarningService } from '../achievements/services/streak-warning.service';
import {
  classifyCompetitor,
  calculateConservativeScore,
} from '../competitors/utils/competitor-classification';
import {
  CRON_SCHEDULES,
  TASK_EXECUTION_CONFIG,
  TASK_DESCRIPTIONS,
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
    private readonly competitorsService: CompetitorsService,
    private readonly competitorRepo: CompetitorRepository,
    private readonly competitorEloSnapshotRepo: CompetitorEloSnapshotRepository,
    private readonly seasonsService: SeasonsService,
    private readonly pingpongDecayService: PingpongDecayService,
    private readonly pingpongEligibilityService: PingpongEligibilityService,
    @InjectRepository(PingpongPlayer)
    private readonly pingpongPlayerRepository: Repository<PingpongPlayer>,
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
  ) {}

  /* ==================== WEEKLY TASKS ==================== */

  /**
   * Run the season transition on the first Monday of a new 4-week season.
   */
  @Cron(CRON_SCHEDULES.SEASON_TRANSITION, {
    name: 'season-transition',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleSeasonTransition(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.seasonTransition) {
      this.logger.warn('Task "season-transition" is disabled');
      return;
    }

    const now = new Date();
    const currentWeekNumber = WeekUtils.getISOWeek(now);
    const currentYear = now.getFullYear();

    if (!SeasonUtils.isFirstWeekOfSeason(currentWeekNumber, currentYear)) {
      return;
    }

    const currentSeasonNumber = SeasonUtils.getSeasonNumber(
      currentWeekNumber,
      currentYear,
    );
    const prev = SeasonUtils.getPreviousSeason(currentSeasonNumber, currentYear);

    this.logger.log(
      `🔄 Season transition: season ${prev.seasonNumber}/${prev.year} → season ${currentSeasonNumber}/${currentYear}`,
    );
    await this.performSeasonTransition(prev.seasonNumber, prev.year);
  }

  /**
   * Perform the full season transition sequence.
   * Called on the Monday of the first week of each new season,
   * AFTER Sunday's finalization has completed.
   */
  private async performSeasonTransition(
    prevSeasonNumber: number,
    prevYear: number,
  ): Promise<void> {
    // 1. Archive previous season
    try {
      await this.retryTask(() =>
        this.seasonsService.archiveSeason(prevSeasonNumber, prevYear),
      );
      this.logger.log(
        `✅ Season ${prevSeasonNumber}/${prevYear} archived successfully`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to archive season: ${error.message}`,
        error.stack,
      );
    }

    // 2. Archive monthly stats (ELO snapshot before reset)
    try {
      await this.retryTask(() =>
        this.archiveSeasonStats(prevSeasonNumber, prevYear),
      );
      this.logger.log('✅ Season stats archived successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to archive season stats: ${error.message}`,
        error.stack,
      );
    }

    // 4. Reset monthly streaks
    try {
      const affectedUsers =
        await this.streakTrackerService.resetMonthlyStreaks();
      this.logger.log(
        `✅ Season streaks reset successfully for ${affectedUsers} users`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to reset season streaks: ${error.message}`,
        error.stack,
      );
      await this.retryTask(() =>
        this.streakTrackerService.resetMonthlyStreaks(),
      );
    }

    // 5. Reset monthly stats (ELO + race counts + totalWins)
    try {
      await this.retryTask(() => this.competitorsService.resetMonthlyStats());
      this.logger.log('✅ Season stats reset successfully');
    } catch (error) {
      this.logger.error(
        `❌ Failed to reset season stats: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Reset weekly activity flags
   * Runs every Monday at 00:05 UTC
   */
  @Cron(CRON_SCHEDULES.RESET_WEEKLY_ACTIVITY, {
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

  /* ==================== SEASON TRANSITION HELPERS ==================== */

  /* ==================== RANK SNAPSHOT TASKS ==================== */

  /**
   * Snapshot competitor ranks (daily)
   * Runs every weekday (Mon-Fri) at 00:00 UTC
   * Saves current rank based on conservativeScore for trend calculation
   */
  @Cron(CRON_SCHEDULES.SNAPSHOT_COMPETITOR_RANKS, {
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

  /* ==================== STREAK WARNING TASKS ==================== */

  /**
   * Betting streak warning
   * Runs every Monday at 18:00 UTC (20h Paris)
   * Since Monday is the only betting day, this sends "DERNIER JOUR" (urgent) messages.
   */
  @Cron(CRON_SCHEDULES.PARTICIPATION_STREAK_WARNING, {
    name: 'betting-streak-warning-early',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handleBettingStreakWarningEarly(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.participationStreakWarning) {
      this.logger.warn('Task "betting-streak-warning-early" is disabled');
      return;
    }

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.participationStreakWarning}`,
    );

    try {
      const warned =
        await this.streakWarningService.checkParticipationStreakWarnings('urgent');
      this.logger.log(`✅ Betting streak warning: ${warned} users warned`);
    } catch (error) {
      this.logger.error(
        `❌ Failed betting streak warning: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Play streak warning
   * Runs every weekday (Mon-Fri) at 09:00 UTC
   */
  @Cron(CRON_SCHEDULES.PLAY_STREAK_WARNING, {
    name: 'play-streak-warning',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handlePlayStreakWarning(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.playStreakWarning) {
      this.logger.warn('Task "play-streak-warning" is disabled');
      return;
    }

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.playStreakWarning}`);

    try {
      const warned = await this.streakWarningService.checkPlayStreakWarnings();
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
  @Cron(CRON_SCHEDULES.SNAPSHOT_COMPETITOR_ELO, {
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
   * Archive season stats for all competitors
   */
  private async archiveSeasonStats(
    seasonNumber: number,
    year: number,
  ): Promise<void> {
    this.logger.log(`Archiving stats for season ${seasonNumber}/${year}`);

    const competitors = await this.competitorRepository.find();

    for (const competitor of competitors) {
      const stats = this.competitorMonthlyStatsRepository.create({
        competitorId: competitor.id,
        month: seasonNumber, // keep month field populated for backward compat
        seasonNumber,
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

  /* ==================== PING-PONG TASKS ==================== */

  /**
   * Widen the deviation of ping-pong players who have not played in a week.
   *
   * The service does this in a single atomic UPDATE guarded by lastDecayAt,
   * so a double run cannot double the decay. The task lock below is a second
   * barrier, not the only one.
   */
  @Cron(CRON_SCHEDULES.PINGPONG_RD_DECAY, {
    name: 'pingpong-rd-decay',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handlePingpongRdDecay(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.pingpongRdDecay) {
      this.logger.warn('Task "pingpong-rd-decay" is disabled');
      return;
    }
    if (!this.acquireTaskLock('pingpong-rd-decay')) return;

    this.logger.log(`🚀 Starting task: ${TASK_DESCRIPTIONS.pingpongRdDecay}`);

    try {
      const count = await this.pingpongDecayService.runDecay();
      this.logger.log(`✅ Ping-pong decay applied to ${count} players`);
    } catch (error) {
      this.logger.error(
        `❌ Ping-pong decay failed: ${error.message}`,
        error.stack,
      );
    } finally {
      this.releaseTaskLock('pingpong-rd-decay');
    }
  }

  /**
   * Snapshot ping-pong ratings for the history chart.
   * Idempotent: the (player, date) unique key turns a repeat into an upsert.
   */
  @Cron(CRON_SCHEDULES.PINGPONG_SNAPSHOT_ELO, {
    name: 'pingpong-snapshot-elo',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handlePingpongSnapshotElo(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.pingpongSnapshotElo) {
      this.logger.warn('Task "pingpong-snapshot-elo" is disabled');
      return;
    }
    if (!this.acquireTaskLock('pingpong-snapshot-elo')) return;

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.pingpongSnapshotElo}`,
    );

    try {
      const today = new Date().toISOString().split('T')[0];
      await this.pingpongPlayerRepository.query(
        `
        INSERT INTO "pingpong_elo_snapshots"
          ("playerId", "date", "rating", "rd", "vol", "matchCount")
        SELECT "id", $1, "rating", "rd", "vol", "matchCount"
        FROM "pingpong_players"
        ON CONFLICT ("playerId", "date") DO UPDATE
        SET "rating" = EXCLUDED."rating",
            "rd" = EXCLUDED."rd",
            "vol" = EXCLUDED."vol",
            "matchCount" = EXCLUDED."matchCount"
        `,
        [today],
      );
      this.logger.log('✅ Ping-pong ELO snapshot done');
    } catch (error) {
      this.logger.error(
        `❌ Ping-pong snapshot failed: ${error.message}`,
        error.stack,
      );
    } finally {
      this.releaseTaskLock('pingpong-snapshot-elo');
    }
  }

  /**
   * Recompute ranking eligibility over the rolling 21-day window.
   *
   * Runs daily rather than after each match: a player can fall out of
   * eligibility through the passage of time alone, with no match to trigger it.
   */
  @Cron(CRON_SCHEDULES.PINGPONG_REFRESH_ELIGIBILITY, {
    name: 'pingpong-refresh-eligibility',
    timeZone: TASK_EXECUTION_CONFIG.timezone,
  })
  async handlePingpongRefreshEligibility(): Promise<void> {
    if (!TASK_EXECUTION_CONFIG.enabledTasks.pingpongRefreshEligibility) {
      this.logger.warn('Task "pingpong-refresh-eligibility" is disabled');
      return;
    }
    if (!this.acquireTaskLock('pingpong-refresh-eligibility')) return;

    this.logger.log(
      `🚀 Starting task: ${TASK_DESCRIPTIONS.pingpongRefreshEligibility}`,
    );

    try {
      const count = await this.pingpongEligibilityService.refreshEligibility();
      this.logger.log(`✅ Eligibility refreshed for ${count} players`);
    } catch (error) {
      this.logger.error(
        `❌ Eligibility refresh failed: ${error.message}`,
        error.stack,
      );
    } finally {
      this.releaseTaskLock('pingpong-refresh-eligibility');
    }
  }

}
