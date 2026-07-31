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
export const CRON_SCHEDULES = {
  /**
   * Season transition (archive, streak reset, ELO reset)
   * Monday 00:05 UTC, only on the first week of a 4-week season.
   */
  SEASON_TRANSITION: '0 5 0 * * 1',

  /**
   * Weekly activity reset
   * Every Monday at 00:00 UTC
   */
  RESET_WEEKLY_ACTIVITY: '0 0 0 * * 1',

  /**
   * Snapshot competitor ranks (weekdays)
   * Mon-Fri at 00:00 UTC
   */
  SNAPSHOT_COMPETITOR_RANKS: '0 0 0 * * 1-5',

  /**
   * Participation streak warning
   * Every Monday at 18:00 UTC (20h Paris)
   * Since the betting window closes at Tuesday 00:00 UTC,
   * this is the last chance reminder on the only betting day.
   */
  PARTICIPATION_STREAK_WARNING: '0 0 18 * * 1',

  /**
   * Play streak warning
   * Every weekday (Mon-Fri) at 09:00 UTC
   */
  PLAY_STREAK_WARNING: '0 0 9 * * 1-5',

  /**
   * Snapshot competitor ELO (daily)
   * Every day at 00:01 UTC
   * Saves current rating/rd/vol for ELO history chart
   */
  SNAPSHOT_COMPETITOR_ELO: '0 1 0 * * *',

  /**
   * Ping-pong inactivity decay
   * Monday 03:30 UTC — after the season transition (00:05), no contention.
   */
  PINGPONG_RD_DECAY: '0 30 3 * * 1',

  /**
   * Ping-pong ELO snapshot
   * Daily 00:02 UTC — one minute after the Mario Kart snapshot.
   */
  PINGPONG_SNAPSHOT_ELO: '0 2 0 * * *',

  /**
   * Ping-pong ranking eligibility refresh
   * Daily 00:15 UTC — rolling 21-day window, after the snapshots.
   */
  PINGPONG_REFRESH_ELIGIBILITY: '0 15 0 * * *',
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
    seasonTransition: true,
    resetWeeklyActivity: true,
    snapshotCompetitorRanks: true,
    participationStreakWarning: true,
    playStreakWarning: true,
    snapshotCompetitorElo: true,
    pingpongRdDecay: true,
    pingpongSnapshotElo: true,
    pingpongRefreshEligibility: true,
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
  resetWeeklyActivity: 'Reset weekly activity flags (Monday 00:00)',
  seasonTransition:
    'Create new betting week + season transition if needed (Monday 00:05)',
  snapshotCompetitorRanks:
    'Snapshot competitor ranks for trends (Mon-Fri 00:00)',
  participationStreakWarning: 'Betting streak warning (Monday 18:00)',
  playStreakWarning: 'Play streak warning (Mon-Fri 09:00)',
  snapshotCompetitorElo:
    'Snapshot competitor ELO for history chart (Daily 00:01)',
  pingpongRdDecay: 'Widen the deviation of inactive ping-pong players',
  pingpongSnapshotElo: 'Snapshot ping-pong ratings for the history chart',
  pingpongRefreshEligibility: 'Recompute ping-pong ranking eligibility',
};

/**
 * Podium determination strategy
 *
 * How to determine the top 3 competitors for a week.
 * Based on conservative score (ELO - 2*RD) at end of week.
 */
