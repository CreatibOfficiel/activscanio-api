import {
  AchievementCategory,
  AchievementDomain,
  AchievementRarity,
} from '../entities/achievement.entity';

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
  domain?: AchievementDomain;

  // Progressive chain fields
  prerequisiteAchievementKey?: string | null;
  tierLevel?: number;
  chainName?: string | null;

  // Temporary achievement fields
  isTemporary?: boolean;
  canBeLost?: boolean;

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

  // Streaks
  currentMonthlyStreak: number;
  longestLifetimeStreak: number;
  currentLifetimeStreak: number;

  // Win streaks
  currentWinStreak: number;
  bestWinStreak: number;

  // Racing stats
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
