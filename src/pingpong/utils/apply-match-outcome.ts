import type { PingpongPlayer } from '../entities/pingpong-player.entity';
import type { PingpongRating } from '../services/pingpong-rating.service';

/**
 * The mutable per-player state a match advances.
 *
 * Structural, not `PingpongPlayer`, so the recompute can drive it with plain
 * in-memory objects without inventing entity instances — and so this file
 * stays honest about the fields it actually touches.
 */
export type PingpongPlayerState = Pick<
  PingpongPlayer,
  | 'rating'
  | 'rd'
  | 'vol'
  | 'matchCount'
  | 'weightedMatchCount'
  | 'currentSeasonMatchCount'
  | 'wins'
  | 'losses'
  | 'setsWon'
  | 'setsLost'
  | 'currentStreak'
  | 'bestStreak'
  | 'lastMatchAt'
>;

export interface MatchOutcome {
  won: boolean;
  setsWon: number;
  setsLost: number;
  playedAt: Date;
}

/**
 * Advance one player by one match.
 *
 * Extracted from PingpongMatchService so the live path and the historical
 * recompute share a single writer. Two copies of this would drift — and a
 * recompute that drifts from the live path silently rewrites the league into
 * numbers no future match will ever reproduce.
 */
export function applyMatchOutcome(
  player: PingpongPlayerState,
  rated: PingpongRating,
  weight: number,
  outcome: MatchOutcome,
): void {
  player.rating = rated.rating;
  player.rd = rated.rd;
  player.vol = rated.vol;

  // Every match counts towards the displayed total, even at zero weight.
  // Only the weighted count moves calibration, so farming the same opponent
  // inflates the stats without shortening the road to a confirmed rating.
  player.matchCount += 1;
  player.weightedMatchCount += weight;
  // Zeroed by the season reset, which reads it to tell active players from
  // absent ones. Incremented here so the live path and the recompute stay
  // the single writer this function exists to be.
  player.currentSeasonMatchCount += 1;

  player.setsWon += outcome.setsWon;
  player.setsLost += outcome.setsLost;
  player.lastMatchAt = outcome.playedAt;

  if (outcome.won) {
    player.wins += 1;
    player.currentStreak += 1;
    player.bestStreak = Math.max(player.bestStreak, player.currentStreak);
  } else {
    player.losses += 1;
    player.currentStreak = 0;
  }
}
