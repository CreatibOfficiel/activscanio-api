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

  /**
   * Minimum lifetime races required to be pariable (calibration period)
   * New players must complete this many races before being eligible for betting
   */
  MIN_LIFETIME_RACES: 5,

  /**
   * Minimum recent races required in the rolling window to be pariable
   * Prevents "snipers" who show up after long absences
   */
  MIN_RECENT_RACES: 2,

  /**
   * Rolling window in days for recent activity check
   * Competitors must have MIN_RECENT_RACES within this window
   */
  RECENT_WINDOW_DAYS: 14,
};

/**
 * Position probability factors
 *
 * These factors distribute the overall podium probability
 * across the three positions (1st, 2nd, 3rd).
 *
 * The idea: if a player has X% chance of finishing on the podium,
 * their chance of finishing exactly 1st is lower than being anywhere in top 3.
 *
 * Factors are adjusted based on player tier:
 * - Strong players (high score) are more likely to be 1st if on podium
 * - Weak players (low score) are more likely to be 3rd if on podium
 */
export const POSITION_FACTORS = {
  /**
   * Default factors for average players
   * These should sum to 1.0
   */
  DEFAULT: {
    first: 0.33,
    second: 0.35,
    third: 0.32,
  },

  /**
   * Top tier adjustment (top 25% by conservative score)
   * Strong players more likely to be 1st
   */
  TOP_TIER: {
    first: 0.45,
    second: 0.32,
    third: 0.23,
  },

  /**
   * Mid tier adjustment (middle 50%)
   * Balanced distribution
   */
  MID_TIER: {
    first: 0.33,
    second: 0.35,
    third: 0.32,
  },

  /**
   * Bottom tier adjustment (bottom 25%)
   * More likely to be 3rd if on podium
   */
  BOTTOM_TIER: {
    first: 0.22,
    second: 0.33,
    third: 0.45,
  },

  /**
   * Percentile thresholds for tier assignment
   */
  THRESHOLDS: {
    topTierPercentile: 0.75, // Top 25%
    bottomTierPercentile: 0.25, // Bottom 25%
  },
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
