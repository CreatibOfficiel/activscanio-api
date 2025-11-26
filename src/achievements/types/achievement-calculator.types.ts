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

  // Lifetime betting stats
  totalBetsPlaced: number;
  totalBetsWon: number;
  totalPerfectBets: number;
  totalPoints: number;

  // Win rates
  winRate: number; // Percentage (0-100)

  // Partial wins (2/3 correct picks)
  partialWins: number;

  // Boost usage
  totalBoostsUsed: number;
  consecutiveBoostMonths: number;

  // High odds bets
  highOddsWins: number; // Wins with odds > 10
  boostedHighOddsWins: number; // Wins with boost + odds > 10

  // Streaks
  currentMonthlyStreak: number;
  longestLifetimeStreak: number;
  currentLifetimeStreak: number;

  // Monthly stats (current month)
  monthlyBetsPlaced: number;
  monthlyBetsWon: number;
  monthlyPerfectBets: number;
  monthlyPoints: number;
  monthlyRank: number | null;

  // Ranking stats
  bestMonthlyRank: number | null;
  consecutiveMonthlyWins: number; // Consecutive months with rank 1

  // Special achievements
  comebackBets: number; // Bets placed after 5+ losing weeks
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
