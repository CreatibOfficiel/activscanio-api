import { PingpongMatch } from '../entities/pingpong-match.entity';
import { PingpongPlayer } from '../entities/pingpong-player.entity';

/**
 * Just enough of a player to name them on a match card.
 *
 * A trimmed shape rather than the full `RankedPingpongPlayer`: a match list
 * has no use for rd, vol, streaks or a rank, and a fifty-row page would carry
 * all of it twice per row. Identity and avatar are what the card renders;
 * anything more belongs to the leaderboard.
 */
export interface PingpongMatchPlayer {
  id: string;
  competitorId: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string;
}

/** A match with both sides named, as the API sends it. */
export type SanitizedPingpongMatch = Omit<
  PingpongMatch,
  'playerA' | 'playerB'
> & {
  playerA: PingpongMatchPlayer | null;
  playerB: PingpongMatchPlayer | null;
};

/**
 * Trim a loaded player relation down to what a match needs.
 *
 * Null in, null out. `onDelete: 'RESTRICT'` makes a dangling side hard to
 * reach, but the relation is still nullable at the type level, and a missing
 * competitor row would otherwise turn into `undefined` inside a template.
 * The empty strings are deliberate: the client renders a placeholder for a
 * blank name, and blank is easier to spot than the string "undefined".
 */
export function sanitizeMatchPlayer(
  player: PingpongPlayer | null | undefined,
): PingpongMatchPlayer | null {
  if (!player) return null;

  return {
    id: player.id,
    competitorId: player.competitorId,
    firstName: player.competitor?.firstName ?? '',
    lastName: player.competitor?.lastName ?? '',
    profilePictureUrl: player.competitor?.profilePictureUrl ?? '',
  };
}

/**
 * A match, with both players embedded.
 *
 * `playerAId` and `playerBId` stay on the row. They are what `winnerId` is
 * compared against, and dropping them in favour of the nested objects would
 * quietly break every winner check.
 */
export function sanitizeMatch(match: PingpongMatch): SanitizedPingpongMatch {
  return {
    ...match,
    playerA: sanitizeMatchPlayer(match.playerA),
    playerB: sanitizeMatchPlayer(match.playerB),
  };
}

/**
 * The relations a match list needs loaded.
 *
 * Named once so the two endpoints cannot drift apart, and so the join is
 * visibly a single query — the alternative, resolving a player per row, is
 * N+1 on a page that routinely runs to fifty matches.
 */
export const MATCH_PLAYER_RELATIONS = [
  'playerA',
  'playerA.competitor',
  'playerB',
  'playerB.competitor',
] as const;
