/**
 * Betting Scoring Configuration
 *
 * Centralized configuration for points calculation rules.
 * All scoring parameters are defined here for easy tuning.
 */

export interface BettingScoringParams {
  /**
   * Perfect podium bonus multiplier (all 3 picks correct)
   * Default: 2x (doubles the total points)
   */
  perfectPodiumBonus: number;

  /**
   * x2 boost multiplier (applied to individual pick)
   * Default: 2x (doubles the points for that pick)
   */
  boostMultiplier: number;

  /**
   * Minimum points for a correct pick (even if odds are very low)
   * Ensures users always get something for correct predictions
   */
  minPointsPerCorrectPick: number;

  /**
   * Points for incorrect pick
   * Default: 0 (no points for wrong predictions)
   */
  incorrectPickPoints: number;
}

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_PARAMS: BettingScoringParams = {
  perfectPodiumBonus: 2.0, // 2x bonus for perfect podium
  boostMultiplier: 2.0, // 2x boost for selected competitor
  minPointsPerCorrectPick: 0.1, // Minimum 0.1 point per correct pick
  incorrectPickPoints: 0, // No points for wrong picks
};

/**
 * Scoring calculation example:
 *
 * Scenario: User bets on podium [A, B, C] with odds [2.5, 3.0, 4.0]
 * User applies x2 boost on pick B
 * Actual podium: [A, B, D]
 *
 * Calculation:
 * - Pick A (first): Correct, points = 2.5 * 1 = 2.5
 * - Pick B (second): Correct, boosted, points = 3.0 * 2 = 6.0
 * - Pick C (third): Incorrect, points = 0
 *
 * Total before bonus: 2.5 + 6.0 + 0 = 8.5
 * Perfect podium? No (only 2/3 correct)
 * Final points: 8.5
 *
 * ---
 *
 * If podium was [A, B, C]:
 * - All 3 picks correct
 * - Total before bonus: 2.5 + 6.0 + 4.0 = 12.5
 * - Perfect podium bonus: 12.5 * 2 = 25 points
 */

/**
 * Logging configuration for scoring operations
 */
export const SCORING_LOGGER_CONFIG = {
  logDetailedCalculations: true, // Log each pick calculation
  logFinalPoints: true, // Log final points for each bet
  logRankingUpdates: true, // Log bettor ranking updates
};
