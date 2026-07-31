import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongMatch } from '../entities/pingpong-match.entity';

/**
 * The single best win a player holds: who they beat, and how strong that
 * opponent was at the moment they beat them.
 */
export interface PingpongBestWin {
  matchId: string;
  opponentId: string;
  /** The opponent's rating BEFORE the match. See the service docblock. */
  opponentRating: number;
  /** The player's own rating before that same match, for the gap. */
  playerRating: number | null;
  playedAt: Date;
}

/**
 * Highest-rated opponent a player has ever beaten.
 *
 * Chosen because it is MONOTONE — it can only ever go up, and no one else's
 * activity can lower it. The leaderboard is otherwise the only story this app
 * tells about a person, and a rank is zero-sum: in a 25-person office half
 * the players sit in the bottom half by construction, however well they play.
 *
 * A peak rating would be worse than saying nothing. Glicko-2 ratings fall as
 * well as rise, and the decay cron lowers a rating while its owner is on
 * holiday, so a peak is a number the player has already dropped below — a
 * goal presented as already failed.
 *
 * Replayed from the match log at read time rather than kept in a column, for
 * the reasons `PingpongHighlightStatsService` sets out: a denormalised column
 * needs a migration per metric and leaves every match already played
 * unscored, whereas the rows already carry both before-ratings.
 */
@Injectable()
export class PingpongBestWinService {
  constructor(
    @InjectRepository(PingpongMatch)
    private readonly matchRepository: Repository<PingpongMatch>,
  ) {}

  async computeFor(playerId: string): Promise<PingpongBestWin | null> {
    const matches = await this.matchRepository.find({
      where: [{ playerAId: playerId }, { playerBId: playerId }],
      select: [
        'id',
        'playerAId',
        'playerBId',
        'winnerId',
        'ratingABefore',
        'ratingBBefore',
        'playedAt',
      ],
    });

    let best: PingpongBestWin | null = null;

    for (const match of matches) {
      // Only wins. Losing to a strong opponent is the expected outcome, not
      // a feat — and counting it would let anyone mint a record by being
      // thrashed by the best player in the office.
      if (match.winnerId !== playerId) continue;

      const playerIsA = match.playerAId === playerId;
      const opponentId = playerIsA ? match.playerBId : match.playerAId;

      // BEFORE, not after: by the time the match is over the opponent has
      // already been docked points for this very loss, so an after-rating
      // understates the feat, and would keep shrinking as they later
      // declined — which would stop the record being monotone.
      const opponentRating = playerIsA
        ? match.ratingBBefore
        : match.ratingABefore;

      // A row with no recorded rating carries no comparable feat. Skipping
      // beats coercing: `Number(null)` is 0, which would read as beating
      // someone rated zero.
      if (
        typeof opponentRating !== 'number' ||
        !Number.isFinite(opponentRating)
      )
        continue;

      if (best && opponentRating <= best.opponentRating) continue;

      const playerRating = playerIsA
        ? match.ratingABefore
        : match.ratingBBefore;

      best = {
        matchId: match.id,
        opponentId,
        opponentRating,
        playerRating:
          typeof playerRating === 'number' && Number.isFinite(playerRating)
            ? playerRating
            : null,
        playedAt: match.playedAt,
      };
    }

    // Null, never 0. "Meilleure victoire : 0" reads as having beaten someone
    // rated zero, which is a worse thing to show a newcomer than an
    // invitation to play their first match.
    return best;
  }
}
