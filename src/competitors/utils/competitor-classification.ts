const INACTIVE_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000; // 8 days
const PROVISIONAL_MIN_RACES = 5;
const PROVISIONAL_MAX_RD = 150;

export interface CompetitorClassification {
  provisional: boolean;
  inactive: boolean;
  confirmed: boolean;
}

/**
 * Classify a competitor into one of 3 tiers:
 * - confirmed: !provisional && !inactive
 * - inactive: !provisional && inactive (last race > 8 days ago)
 * - calibrating (provisional): raceCount < 5 || rd > 150
 */
export function classifyCompetitor(
  raceCount: number,
  rd: number,
  lastRaceDate: Date | string | null,
): CompetitorClassification {
  const provisional =
    raceCount < PROVISIONAL_MIN_RACES || rd > PROVISIONAL_MAX_RD;

  let inactive = false;
  if (!provisional) {
    inactive =
      !lastRaceDate ||
      Date.now() - new Date(lastRaceDate).getTime() > INACTIVE_THRESHOLD_MS;
  }

  return {
    provisional,
    inactive,
    confirmed: !provisional && !inactive,
  };
}

/**
 * Calculate conservative score (Glicko-2 lower bound).
 * Used for ranking: rating - 2 * rd
 */
export function calculateConservativeScore(
  rating: number,
  rd: number,
): number {
  return rating - 2 * rd;
}
