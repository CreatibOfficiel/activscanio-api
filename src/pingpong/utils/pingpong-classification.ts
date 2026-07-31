/**
 * Ping-pong classification and score validation.
 *
 * Thresholds differ from Mario Kart on purpose: office table tennis is played
 * less often than a lunchtime race, so a player stays "active" longer, and the
 * deviation floor sits higher because skill drifts faster over months.
 */

/** Weighted matches needed to leave calibration. */
export const PROVISIONAL_MIN_MATCHES = 8;
/** Deviation above which a rating is still considered unsettled. */
export const PROVISIONAL_MAX_RD = 150;
/** Days without a match before a player drops out of the ranked table. */
export const INACTIVE_THRESHOLD_DAYS = 14;
/** Days without a match before a player is hidden entirely. */
export const ARCHIVED_THRESHOLD_DAYS = 180;

export interface PingpongClassification {
  provisional: boolean;
  inactive: boolean;
  archived: boolean;
  confirmed: boolean;
}

/**
 * Classify a player for display in the leaderboard.
 *
 * @param weightedMatchCount sum of applied weights, NOT the raw match count.
 *   Using the raw count would let a player farm their way out of calibration
 *   by replaying the same opponent.
 */
export function classifyPingpongPlayer(
  weightedMatchCount: number,
  rd: number,
  lastMatchAt: Date | null,
  now: Date = new Date(),
): PingpongClassification {
  const provisional =
    weightedMatchCount < PROVISIONAL_MIN_MATCHES || rd > PROVISIONAL_MAX_RD;

  const daysSinceLastMatch = lastMatchAt
    ? (now.getTime() - lastMatchAt.getTime()) / (24 * 60 * 60 * 1000)
    : Infinity;

  const archived = daysSinceLastMatch > ARCHIVED_THRESHOLD_DAYS;
  const inactive = !archived && daysSinceLastMatch > INACTIVE_THRESHOLD_DAYS;

  return {
    provisional,
    inactive,
    archived,
    confirmed: !provisional && !inactive && !archived,
  };
}

/**
 * Is this a score a set could actually have ended on?
 *
 * A set goes to 11, but only with two clear points. At 10-10 it carries on
 * until someone leads by two — so 11-10 is impossible, and past 11 the margin
 * is always exactly 2.
 */
export function isValidSetScore(a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a < 0 || b < 0) return false;
  if (a === b) return false;

  const winner = Math.max(a, b);
  const loser = Math.min(a, b);

  if (winner === 11) return loser <= 9;
  if (winner > 11) return winner - loser === 2;
  return false;
}

export interface SetScore {
  a: number;
  b: number;
}

export interface MatchValidation {
  valid: boolean;
  reason?: string;
  setsA: number;
  setsB: number;
  winner: 'A' | 'B' | null;
}

/** Sets a player must win to take the match. Best-of-three. */
export const SETS_TO_WIN = 2;

/**
 * Validate a full best-of-three match.
 *
 * Rejects a match that ran longer than it should have: once someone has two
 * sets, the match is over, so a third set after a 2-0 never happened.
 */
export function validateMatchSets(sets: SetScore[]): MatchValidation {
  const invalid = (reason: string): MatchValidation => ({
    valid: false,
    reason,
    setsA: 0,
    setsB: 0,
    winner: null,
  });

  if (sets.length < SETS_TO_WIN) {
    return invalid('A match needs at least two sets');
  }
  if (sets.length > SETS_TO_WIN + 1) {
    return invalid('A best-of-three match cannot have more than three sets');
  }

  let setsA = 0;
  let setsB = 0;

  for (const [index, set] of sets.entries()) {
    if (!isValidSetScore(set.a, set.b)) {
      return invalid(`Set ${index + 1} has an impossible score`);
    }

    // The match should have stopped the moment someone reached two sets.
    if (setsA === SETS_TO_WIN || setsB === SETS_TO_WIN) {
      return invalid(`Set ${index + 1} was played after the match was decided`);
    }

    if (set.a > set.b) setsA += 1;
    else setsB += 1;
  }

  if (setsA !== SETS_TO_WIN && setsB !== SETS_TO_WIN) {
    return invalid('No player reached two sets');
  }

  return {
    valid: true,
    setsA,
    setsB,
    winner: setsA > setsB ? 'A' : 'B',
  };
}
