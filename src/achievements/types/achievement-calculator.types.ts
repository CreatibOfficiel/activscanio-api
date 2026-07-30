/**
 * Context passed when a bet is finalized
 */
export interface BetFinalizedContext {
  userId: string;
  betId: string;
  weekId: string;
  pointsEarned: number;
  isPerfectPodium: boolean;
  correctPicks: number;
  totalPicks: number;
  hasBoost: boolean;
  highestOdd?: number;
}

/**
 * User statistics aggregated for achievement evaluation
 */
export interface UserStats {
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
}

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
