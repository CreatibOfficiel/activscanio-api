import { AchievementCategory, AchievementRarity } from '../entities/achievement.entity';

/**
 * Achievement DTO for API responses
 */
export class AchievementResponseDto {
  id: string;
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon: string;
  xpReward: number;
  unlocksTitle: string | null;

  // User-specific fields (if querying for a specific user)
  isUnlocked?: boolean;
  unlockedAt?: Date | null;
  progress?: number; // 0-100
}

/**
 * User achievement DTO
 */
export class UserAchievementResponseDto {
  id: string;
  achievementId: string;
  unlockedAt: Date;
  notificationSent: boolean;

  // Populated achievement details
  achievement: {
    key: string;
    name: string;
    description: string;
    category: AchievementCategory;
    rarity: AchievementRarity;
    icon: string;
    xpReward: number;
    unlocksTitle: string | null;
  };
}

/**
 * User stats DTO
 */
export class UserStatsResponseDto {
  userId: string;

  // XP and Level
  xp: number;
  level: number;
  xpForNextLevel: number;
  xpProgressPercent: number;
  currentTitle: string | null;

  // Achievement stats
  totalAchievements: number;
  unlockedAchievements: number;
  achievementProgress: number; // Percentage
  lastAchievementUnlockedAt: Date | null;

  // Betting stats (lifetime)
  totalBetsPlaced: number;
  totalBetsWon: number;
  totalPerfectBets: number;
  totalPoints: number;
  winRate: number;

  // Streaks
  currentMonthlyStreak: number;
  longestLifetimeStreak: number;
  currentLifetimeStreak: number;

  // Monthly stats
  monthlyBetsPlaced: number;
  monthlyBetsWon: number;
  monthlyPerfectBets: number;
  monthlyPoints: number;
  monthlyRank: number | null;

  // Ranking
  bestMonthlyRank: number | null;
  consecutiveMonthlyWins: number;

  // Special
  totalBoostsUsed: number;
  highOddsWins: number;
  boostedHighOddsWins: number;
}
