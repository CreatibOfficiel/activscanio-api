import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { detectMatchHighlights } from '../utils/match-highlights';
import { SetScore } from '../utils/pingpong-classification';

/**
 * Tallies that only exist in the shape of individual matches.
 *
 * Every field counts MATCHES, not sets: a match won with two 11-0 sets counts
 * once. The achievements read "win a match containing a shutout set", which is
 * the shape players actually remember.
 */
export interface PingpongHighlightStats {
  pingpongShutoutSetsDealt: number;
  pingpongShutoutSetsConceded: number;
  pingpongComebacks: number;
  pingpongDeuceSetsWon: number;
  pingpongUpsets: number;
  pingpongBiggestUpsetGap: number;
  pingpongHeists: number;
}

export const EMPTY_HIGHLIGHT_STATS: PingpongHighlightStats = {
  pingpongShutoutSetsDealt: 0,
  pingpongShutoutSetsConceded: 0,
  pingpongComebacks: 0,
  pingpongDeuceSetsWon: 0,
  pingpongUpsets: 0,
  pingpongBiggestUpsetGap: 0,
  pingpongHeists: 0,
};

/**
 * Replays a player's match log to tally the per-match achievements.
 *
 * The alternative was a boolean column per achievement, written at record
 * time. That needs a migration every time a new achievement is invented, and
 * leaves every match already played unscored. Replaying costs one indexed read
 * per achievement check and makes new achievements retroactive for free — the
 * match rows already carry the set scores and both before-ratings.
 */
@Injectable()
export class PingpongHighlightStatsService {
  constructor(
    @InjectRepository(PingpongMatch)
    private readonly matchRepository: Repository<PingpongMatch>,
  ) {}

  async computeFor(playerId: string): Promise<PingpongHighlightStats> {
    const matches = await this.matchRepository.find({
      where: [{ playerAId: playerId }, { playerBId: playerId }],
      select: [
        'playerAId',
        'playerBId',
        'winnerId',
        'sets',
        'ratingABefore',
        'ratingBBefore',
      ],
    });

    const stats = { ...EMPTY_HIGHLIGHT_STATS };

    for (const match of matches) {
      const sets = match.sets as SetScore[] | null;
      // A row with no scores carries no highlight. Skipping beats throwing:
      // one bad row should not deny the player every achievement they hold.
      if (!Array.isArray(sets) || sets.length === 0) continue;

      const playerIsA = match.playerAId === playerId;
      const won = match.winnerId === playerId;

      // `detectMatchHighlights` reports from the perspective it is given, so
      // pass our player's side — not the match winner's.
      const mine = detectMatchHighlights({
        sets,
        winner: playerIsA ? 'A' : 'B',
        selfRatingBefore: playerIsA ? match.ratingABefore : match.ratingBBefore,
        opponentRatingBefore: playerIsA
          ? match.ratingBBefore
          : match.ratingABefore,
      });

      if (mine.dealtShutoutSet) stats.pingpongShutoutSetsDealt += 1;
      if (mine.concededShutoutSet) stats.pingpongShutoutSetsConceded += 1;
      if (mine.deuceSetsWon > 0) stats.pingpongDeuceSetsWon += 1;

      // The rest are feats of winning. Read from a loser's side, "came back"
      // would mean "was ahead and threw it away", which is not the achievement.
      if (!won) continue;

      if (mine.cameBack) stats.pingpongComebacks += 1;
      if (mine.isHeist) stats.pingpongHeists += 1;
      if (mine.isUpset) {
        stats.pingpongUpsets += 1;
        stats.pingpongBiggestUpsetGap = Math.max(
          stats.pingpongBiggestUpsetGap,
          mine.ratingGapBeaten,
        );
      }
    }

    return stats;
  }
}
