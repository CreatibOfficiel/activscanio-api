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
 */
export const DEFAULT_ODDS_PARAMS: OddsCalculationParams = {
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
   * Number of recent races to analyze for eligibility
   */
  recentRacesCount: 5,
};

/**
 * Eligibility rules
 */
export const ELIGIBILITY_RULES = {
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
  RECENT_WINDOW_DAYS: 30,
};

/**
 * Monte Carlo simulation configuration
 *
 * Used to estimate P(1st), P(2nd), P(3rd) for each competitor
 * via repeated random draws weighted by Plackett-Luce strengths.
 */
export const MONTE_CARLO_CONFIG = {
  /** Number of simulation runs */
  NUM_SIMULATIONS: 50_000,

  /** Glicko-2 scaling factor (maps rating to logistic scale) */
  GLICKO_SCALE: 173.7178,

  /** Whether to incorporate RD via g(phi) dampening */
  INCORPORATE_RD: true,

  /** Number of podium positions to simulate */
  PODIUM_SIZE: 3,
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
