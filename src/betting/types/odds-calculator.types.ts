/**
 * Types and interfaces for the Odds Calculator system
 *
 * This file contains all type definitions used throughout the odds calculation process.
 * Keeping types centralized improves maintainability and type safety.
 */

import { Competitor } from '../../competitors/competitor.entity';

/**
 * Reason why a competitor is not eligible for betting
 */
export type IneligibilityReason =
  | 'calibrating' // Less than MIN_LIFETIME_RACES total races
  | 'inactive' // Less than MIN_RECENT_RACES in rolling window
  | 'no_races_this_week' // No races in current betting week
  | null; // Eligible

/**
 * Raw competitor data needed for odds calculation
 */
export interface CompetitorWithStats {
  competitor: Competitor;
  recentRaces: RecentRacePerformance[];
  isEligible: boolean; // Has at least 1 race this week AND meets other criteria
  ineligibilityReason?: IneligibilityReason;
  calibrationProgress?: number; // X out of MIN_LIFETIME_RACES
  recentRacesIn14Days?: number; // Count of races in rolling window
}

/**
 * Recent race performance for form calculation
 */
export interface RecentRacePerformance {
  rank12: number; // Position in race (1-12)
  date: Date;
  raceId: string;
}

/**
 * Intermediate calculation result for a competitor
 */
export interface OddsCalculationStep {
  competitorId: string;
  competitorName: string;

  // Step 1: Base metrics
  rating: number;
  rd: number; // Rating Deviation
  conservativeScore: number; // rating - 2 * rd

  // Step 2: Recent stats
  recentRaceCount: number;
  avgRecentRank: number;
  winStreak: number;
  formFactor: number; // Always 1.0 (kept for JSONB compat)

  // Step 3: Probability calculation
  rawProbability: number;
  adjustedProbability: number; // Same as rawProbability (no form adjustment)
  normalizedProbability: number; // Sum = 1

  // Step 4: Final odd
  odd: number;
  cappedOdd: number; // After min/max bounds

  // Position-specific odds
  oddFirst: number;
  oddSecond: number;
  oddThird: number;

  // Metadata
  isEligible: boolean;
  calculatedAt: Date;
}

/**
 * Final odds result for a betting week
 */
export interface OddsCalculationResult {
  bettingWeekId: string;
  calculatedAt: Date;
  eligibleCompetitorsCount: number;
  totalCompetitorsCount: number;
  odds: CompetitorOdd[];
  calculationSteps: OddsCalculationStep[]; // For debugging
}

/**
 * Individual competitor odd
 */
export interface CompetitorOdd {
  competitorId: string;
  competitorName: string;
  /** @deprecated Use oddFirst, oddSecond, oddThird instead */
  odd: number;
  oddFirst: number;
  oddSecond: number;
  oddThird: number;
  probability: number;
  isEligible: boolean;
  metadata: OddMetadata;
}

/**
 * Metadata stored with each odd for transparency
 */
export interface OddMetadata {
  elo: number;
  rd: number;
  recentWins: number;
  winStreak: number;
  raceCount: number;
  avgRank: number;
  formFactor: number;
  probability: number;
}

/**
 * Configuration parameters for odds calculation
 * Allows easy tuning without modifying core logic
 */
export interface OddsCalculationParams {
  baseMultiplier: number; // Base multiplier for odds (default: 10)
  minOdd: number; // Minimum odd value (default: 1.1)
  maxOdd: number; // Maximum odd value (default: 50)
  recentRacesCount: number; // Number of recent races to consider (default: 5)
}
