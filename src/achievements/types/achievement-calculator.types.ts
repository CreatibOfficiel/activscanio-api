import { PingpongHighlightStats } from '../../pingpong/services/pingpong-highlight-stats.service';

/** Stats read straight off the user, competitor and ping-pong player rows. */
export interface BaseUserStats {
  // Basic stats
  userId: string;

  // Participation streaks
  currentMonthlyStreak: number;
  longestLifetimeStreak: number;
  currentLifetimeStreak: number;

  // Win streaks
  currentWinStreak: number;
  bestWinStreak: number;

  // Competitor stats (racing)
  isCompetitor: boolean;
  competitorTotalWins: number;
  competitorRaceCount: number;
  competitorWinStreak: number;
  competitorBestWinStreak: number;
  competitorPlayStreak: number;
  competitorBestPlayStreak: number;
  competitorRating: number;
  competitorAvgRank12: number;

  // Ping-pong stats. Prefixed because the metric namespace is flat and global:
  // an unprefixed `wins` would answer for racing achievements too.
  isPingpongPlayer: boolean;
  pingpongMatchCount: number;
  pingpongWeightedMatchCount: number;
  pingpongWins: number;
  pingpongLosses: number;
  pingpongSetsWon: number;
  pingpongCurrentStreak: number;
  pingpongBestStreak: number;
  pingpongRating: number;
  pingpongDistinctOpponents: number;
  pingpongDiversityScore: number;
}

/**
 * Everything the achievement engine can read about a user.
 *
 * The per-match tallies are spread in from the ping-pong module rather than
 * restated here, so adding one there cannot leave this type behind.
 */
export type UserStats = BaseUserStats & PingpongHighlightStats;

/**
 * Achievement unlock result
 */
export interface AchievementUnlockResult {
  achievementId: string;
  achievementKey: string;
  achievementName: string;
  xpReward: number;
  unlocksTitle: string | null;
  unlockedAt: Date;
}
