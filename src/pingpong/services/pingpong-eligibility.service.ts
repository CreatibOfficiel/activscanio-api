import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { shannonDiversity } from '../utils/diversity';
import { PROVISIONAL_MIN_MATCHES } from '../utils/pingpong-classification';

/** Rolling window over which diversity is measured, in days. */
export const ELIGIBILITY_WINDOW_DAYS = 21;

/**
 * Opponent diversity — measured, never a gate.
 *
 * An earlier version of this service hid players from the ranking until they
 * had faced 4 distinct opponents inside the window. That rule is gone.
 *
 * WHY IT WENT: no documented rating system gates ranking on who you played.
 * FIDE requires 5 games against rated opponents with no distinctness
 * qualifier; USATT has no minimum at all; Lichess gates on 30 games, recency
 * and RD < 75; TrueSkill hides nobody and lets the conservative estimate
 * sink the uncertain. Glickman's paper states outright that repeat matches
 * against one opponent are treated as ordinary games. Those systems can
 * ignore the problem because a matchmaker guarantees variety — but the fix
 * for a hand-scheduled league is not to hide people. In a 25-person office,
 * someone playing three lunchtime games a week with the same two colleagues
 * reaches nine matches and would still never appear. The rule punished
 * exactly the most engaged players.
 *
 * WHAT REPLACES IT: farming is handled in the rating path, where it belongs.
 * The per-pair weighting gives a fourth match against the same person in one
 * week half weight and a seventh none, so a farmed record stops moving the
 * rating and never leaves calibration. The leaderboard then sorts on the
 * conservative score, which sinks a thinly-tested rating on its own.
 *
 * WHAT REMAINS HERE: the diversity measurement itself, surfaced as a badge,
 * and the one honest gate — whether the rating has left calibration.
 *
 * This service still never touches a rating. A rating is a measurement, and
 * we do not distort a measurement to correct a scheduling habit.
 */
@Injectable()
export class PingpongEligibilityService {
  private readonly logger = new Logger(PingpongEligibilityService.name);

  constructor(
    @InjectRepository(PingpongPlayer)
    private readonly playerRepository: Repository<PingpongPlayer>,
    @InjectRepository(PingpongMatch)
    private readonly matchRepository: Repository<PingpongMatch>,
  ) {}

  /**
   * Recompute the diversity stats, and whether each player is ranked.
   *
   * Runs on a cron rather than after each match, because the window is
   * rolling: the diversity figures change purely through the passage of
   * time, with no new match to trigger a recalculation.
   */
  async refreshEligibility(now: Date = new Date()): Promise<number> {
    const since = new Date(
      now.getTime() - ELIGIBILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const players = await this.playerRepository.find();
    let updated = 0;

    for (const player of players) {
      const matches = await this.matchRepository.find({
        where: [
          { playerAId: player.id, playedAt: MoreThanOrEqual(since) },
          { playerBId: player.id, playedAt: MoreThanOrEqual(since) },
        ],
      });

      const counts = this.countByOpponent(player.id, matches);

      await this.playerRepository.update(player.id, {
        // The only gate: enough matches for the rating to mean something.
        // Still reads weightedMatchCount, which now tracks matchCount exactly
        // since every match weighs 1 — the column stays as the historical
        // record of what the old pairing rule applied.
        isRankingEligible: player.weightedMatchCount >= PROVISIONAL_MIN_MATCHES,
        distinctOpponents21d: counts.length,
        diversityScore21d: shannonDiversity(counts),
      });
      updated += 1;
    }

    this.logger.log(`Refreshed ranking status for ${updated} players`);
    return updated;
  }

  /** Matches per opponent, looking at both sides of each match. */
  private countByOpponent(
    playerId: string,
    matches: PingpongMatch[],
  ): number[] {
    const byOpponent = new Map<string, number>();

    for (const match of matches) {
      const opponentId =
        match.playerAId === playerId ? match.playerBId : match.playerAId;
      byOpponent.set(opponentId, (byOpponent.get(opponentId) ?? 0) + 1);
    }

    return [...byOpponent.values()];
  }
}
