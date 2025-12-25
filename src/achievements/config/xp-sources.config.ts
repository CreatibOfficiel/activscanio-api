/**
 * XP Sources Configuration
 *
 * Defines how much XP is awarded for different actions and achievements
 */

export const XP_SOURCES = {
  // Betting actions
  BET_PLACED: 10,
  CORRECT_PICK: 20,
  PERFECT_PODIUM: 100,
  WEEKLY_PARTICIPATION: 50,
  STREAK_MAINTAINED: 25,

  // Achievement unlocks (by rarity)
  ACHIEVEMENT_COMMON: 10,
  ACHIEVEMENT_RARE: 50,
  ACHIEVEMENT_EPIC: 250,
  ACHIEVEMENT_LEGENDARY: 500,

  // Bonus XP
  LEVEL_UP_BONUS: 100,

  // New daily/weekly bonuses
  DAILY_LOGIN_BONUS: 5,
  DAILY_FIRST_BET_BONUS: 10,
  WEEKLY_STREAK_BONUS: 50,
  PERFECT_WEEK_BONUS: 100,
  COMEBACK_BONUS: 25,

  // HIGH_ODDS_BONUS is calculated dynamically based on odds
  // Formula: (odds - 5) * 5 XP, capped at 200 XP
  HIGH_ODDS_BONUS: 0, // Placeholder, actual value calculated dynamically
};

/**
 * Level calculation formula
 *
 * XP required for level N = 100 * N * (N + 1) / 2
 *
 * Examples:
 * - Level 1: 100 XP
 * - Level 2: 300 XP total (200 from level 1)
 * - Level 3: 600 XP total (300 from level 2)
 * - Level 10: 5,500 XP total
 * - Level 20: 21,000 XP total
 */
export const LEVEL_FORMULA = {
  /**
   * Base multiplier for level calculation
   */
  BASE_MULTIPLIER: 100,
};
