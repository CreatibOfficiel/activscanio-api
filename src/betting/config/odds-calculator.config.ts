/**
 * Centralized configuration for the Odds Calculator
 *
 * All tunable parameters are defined here for easy maintenance and testing.
 * Values can be adjusted without modifying core business logic.
 */

import { OddsCalculationParams } from '../types/odds-calculator.types';

/**
 * Default calculation parameters
 *
 * These values have been chosen to provide:
 * - Reasonable odds range (1.1x to 50x)
 * - Balanced form factor influence
 * - Meaningful win streak rewards
 */
export const DEFAULT_ODDS_PARAMS: OddsCalculationParams = {
  /**
   * Base multiplier applied to probabilities
   * Higher value = generally higher odds
   * Example: With 10%, probability gives odd of 10 / 0.1 = 100 (before capping)
   */
  baseMultiplier: 10,

  /**
   * Minimum odd value (prevents odds too close to 1.0)
   * Ensures minimum return even for heavy favorites
   */
  minOdd: 1.1,

  /**
   * Maximum odd value (prevents extreme outliers)
   * Caps maximum potential winnings for very unlikely outcomes
   */
  maxOdd: 50,

  /**
   * Minimum form factor (poor recent form)
   * A competitor with terrible recent results gets this multiplier
   * 0.7 = 30% penalty on their probability
   */
  formFactorMin: 0.7,

  /**
   * Maximum form factor (excellent recent form)
   * A competitor on a hot streak gets this multiplier
   * 1.3 = 30% boost to their probability
   */
  formFactorMax: 1.3,

  /**
   * Bonus per consecutive win
   * Each win in the streak adds this to the form factor
   * 0.05 = 5% boost per win (e.g., 3-win streak = +15%)
   */
  winStreakBonus: 0.05,

  /**
   * Number of recent races to analyze for form
   * Higher value = more historical data
   * Lower value = more reactive to recent changes
   */
  recentRacesCount: 5,
};

/**
 * Rank thresholds for form factor calculation
 *
 * These define how recent race positions affect form.
 * Lower rank = better performance = higher form factor
 */
export const FORM_RANK_THRESHOLDS = {
  /** Top tier performance (1st-3rd place) */
  EXCELLENT: {
    maxRank: 3,
    baseFactor: 1.2,
  },

  /** Good performance (4th-6th place) */
  GOOD: {
    maxRank: 6,
    baseFactor: 1.1,
  },

  /** Average performance (7th-9th place) */
  AVERAGE: {
    maxRank: 9,
    baseFactor: 1.0,
  },

  /** Poor performance (10th-12th place) */
  POOR: {
    maxRank: 12,
    baseFactor: 0.9,
  },
};

/**
 * Eligibility rules
 */
export const ELIGIBILITY_RULES = {
  /**
   * Minimum races required in the week to be eligible for podium
   * This prevents inactive players from being included in betting
   */
  MIN_RACES_THIS_WEEK: 1,
};

/**
 * Logging configuration
 */
export const ODDS_LOGGER_CONFIG = {
  /**
   * Enable detailed calculation logging
   * Useful for debugging and auditing
   */
  enableDetailedLogs: process.env.NODE_ENV === 'development',

  /**
   * Log calculation steps for each competitor
   * Warning: Can be very verbose
   */
  logCalculationSteps: false,
};
