/**
 * Tasks Configuration
 *
 * Centralized configuration for all scheduled tasks (cron jobs).
 * All schedules use UTC timezone.
 *
 * Cron expression format: * * * * * *
 * ┌───────────── second (optional, 0-59)
 * │ ┌───────────── minute (0-59)
 * │ │ ┌───────────── hour (0-23)
 * │ │ │ ┌───────────── day of month (1-31)
 * │ │ │ │ ┌───────────── month (1-12)
 * │ │ │ │ │ ┌───────────── day of week (0-7, 0 and 7 are Sunday)
 * │ │ │ │ │ │
 * * * * * * *
 */

/**
 * Cron schedules for betting system
 */
export const BETTING_CRON_SCHEDULES = {
  /**
   * Create new betting week
   * Every Monday at 00:00 UTC
   */
  CREATE_WEEK: '0 0 0 * * 1',

  /**
   * Reset weekly activity flags
   * Every Monday at 00:05 UTC (after week creation)
   */
  RESET_WEEKLY_ACTIVITY: '0 5 0 * * 1',

  /**
   * Close current betting week
   * Every Sunday at 23:50 UTC (before finalization)
   */
  CLOSE_WEEK: '0 50 23 * * 0',

  /**
   * Finalize betting week (determine podium + calculate points)
   * Every Sunday at 23:55 UTC (after closing)
   */
  FINALIZE_WEEK: '0 55 23 * * 0',

  /**
   * Recalculate monthly rankings
   * Every Sunday at 23:58 UTC (after all finalization)
   */
  RECALCULATE_RANKINGS: '0 58 23 * * 0',

  /**
   * Archive previous season (BEFORE reset)
   * 1st of every month at 00:01 UTC
   */
  ARCHIVE_SEASON: '0 1 0 1 * *',

  /**
   * Archive monthly stats (save ELO snapshot BEFORE reset)
   * 1st of every month at 00:02 UTC
   */
  ARCHIVE_MONTHLY_STATS: '0 2 0 1 * *',

  /**
   * Reset boost availability for all users
   * 1st of every month at 00:03 UTC
   */
  RESET_BOOST_AVAILABILITY: '0 3 0 1 * *',

  /**
   * Reset monthly stats (ELO + race counts)
   * 1st of every month at 00:05 UTC (AFTER archiving)
   */
  RESET_MONTHLY_STATS: '0 5 0 1 * *',
};

/**
 * Task execution configuration
 */
export const TASK_EXECUTION_CONFIG = {
  /**
   * Enable/disable specific tasks
   * Useful for development or maintenance
   */
  enabledTasks: {
    createWeek: true,
    resetWeeklyActivity: true,
    closeWeek: true,
    finalizeWeek: true,
    recalculateRankings: true,
    archiveSeason: true,
    resetBoostAvailability: true,
    resetMonthlyStats: true,
    archiveMonthlyStats: true,
  },

  /**
   * Retry configuration for failed tasks
   */
  retry: {
    maxAttempts: 3,
    delayMs: 5000, // 5 seconds between retries
  },

  /**
   * Timezone for all cron jobs
   * IMPORTANT: Keep as UTC to avoid daylight saving issues
   */
  timezone: 'UTC',
};

/**
 * Task descriptions for logging
 */
export const TASK_DESCRIPTIONS = {
  createWeek: 'Create new betting week (Monday 00:00)',
  resetWeeklyActivity: 'Reset weekly activity flags (Monday 00:05)',
  closeWeek: 'Close betting week (Sunday 23:50)',
  finalizeWeek: 'Finalize betting week and calculate points (Sunday 23:55)',
  recalculateRankings: 'Recalculate monthly rankings (Sunday 23:58)',
  archiveSeason: 'Archive previous season (1st 00:01)',
  resetBoostAvailability: 'Reset boost availability for all users (1st 00:02)',
  resetMonthlyStats: 'Reset monthly ELO and race counts (1st 00:05)',
  archiveMonthlyStats: 'Archive monthly stats snapshot (1st 00:10)',
};

/**
 * Podium determination strategy
 *
 * How to determine the top 3 competitors for a week.
 * Based on conservative score (ELO - 2*RD) at end of week.
 */
export const PODIUM_DETERMINATION_CONFIG = {
  /**
   * Scoring method for podium determination
   * - 'conservative': rating - 2 * rd (default, more stable)
   * - 'rating': raw rating (more volatile)
   * - 'race_count': most races wins (activity-based)
   */
  scoringMethod: 'conservative' as 'conservative' | 'rating' | 'race_count',

  /**
   * Minimum races required to be eligible for podium
   * Default: 1 race during the week
   */
  minRacesForPodium: 1,

  /**
   * Tie-breaking rules (in order of priority)
   * 1. Higher rating
   * 2. Lower RD (more consistent)
   * 3. More races played
   */
  tieBreakers: ['rating', 'rd', 'raceCount'] as const,
};
