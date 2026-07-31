import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceResult } from '../race-result.entity';

/**
 * The strongest competitor a player has ever finished ahead of.
 */
export interface RaceBestWin {
  raceId: string;
  opponentId: string;
  /** The opponent's rating BEFORE the race. See the service docblock. */
  opponentRating: number;
  /** Where the player themselves finished in that race. */
  rank12: number;
  raceDate: Date;
}

/**
 * Highest-rated opponent ever beaten in a race.
 *
 * The Mario Kart half of the same monotone record the ping-pong side keeps.
 * It only ever goes up, and nobody else's activity can lower it — unlike a
 * rank, which is zero-sum and leaves half the office permanently in its
 * bottom half, and unlike a peak rating, which the Glicko-2 decay cron pushes
 * out of reach while its owner is on holiday.
 *
 * A race has up to twelve finishers and no `winnerId` to read from one
 * player's point of view, so "beating" someone means finishing ahead of them:
 * a strictly lower `rank12`. That is what makes the metric reachable rather
 * than a second trophy for whoever wins — a 3rd place still beat everyone
 * behind it, and that is a true thing worth showing.
 *
 * Read at query time from `race_results` rather than denormalised, matching
 * `PingpongHighlightStatsService`: no migration per metric, and every race
 * already recorded counts retroactively.
 */
@Injectable()
export class RaceBestWinService {
  constructor(
    @InjectRepository(RaceResult)
    private readonly resultRepository: Repository<RaceResult>,
  ) {}

  async computeFor(competitorId: string): Promise<RaceBestWin | null> {
    // Every result row of every race this competitor appeared in. The race
    // relation carries the other finishers, who are the opponents.
    const mine = await this.resultRepository.find({
      where: { competitorId },
      relations: ['race', 'race.results'],
    });

    let best: RaceBestWin | null = null;

    for (const own of mine) {
      const rank = own.rank12;
      // Without our own finishing position there is nothing to compare the
      // rest of the field against.
      if (typeof rank !== 'number' || !Number.isFinite(rank)) continue;

      const race = own.race;
      const field = race?.results;
      if (!Array.isArray(field)) continue;

      for (const other of field) {
        // Belt and braces. The strict-rank test below already excludes this
        // row (a result always ties itself), so this line changes no current
        // behaviour — it states the invariant so that loosening the rank
        // comparison to `<=` later cannot silently make a player their own
        // best victim, reporting their own rating back at them.
        if (other.competitorId === competitorId) continue;

        const theirRank = other.rank12;
        if (typeof theirRank !== 'number' || !Number.isFinite(theirRank))
          continue;

        // Strictly ahead. `<=` would count a dead heat as a win, which it
        // is not, and would hand out a record for a tie.
        if (rank >= theirRank) continue;

        // BEFORE, not after — after the race they have already lost points
        // for finishing behind us, which understates the feat.
        //
        // `ratingBefore` was added by migration 1773100000000 with no
        // backfill, so every race recorded before it holds NULL here. That
        // is missing data, not a rating of zero: skip it, never coerce it.
        const rating = other.ratingBefore;
        if (typeof rating !== 'number' || !Number.isFinite(rating)) continue;

        if (best && rating <= best.opponentRating) continue;

        best = {
          raceId: race.id,
          opponentId: other.competitorId,
          opponentRating: rating,
          rank12: rank,
          raceDate: race.date,
        };
      }
    }

    // Null rather than 0, for the same reason as the ping-pong service: a
    // "0" claims a win over someone rated zero.
    return best;
  }
}
