import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { shannonDiversity } from '../utils/diversity';

/** Distinct opponents needed over the window to enter the ranked table. */
export const MIN_DISTINCT_OPPONENTS = 4;
/** Normalised entropy needed over the window. */
export const MIN_DIVERSITY_SCORE = 0.5;
/** Rolling window, in days. */
export const ELIGIBILITY_WINDOW_DAYS = 21;

/**
 * Ranking eligibility — the third anti-farming layer.
 *
 * Unlike the pairing weight and the rating freeze, this one never touches a
 * rating. A player who only ever faces the same opponent keeps a perfectly
 * real rating; they just do not appear in the ranked table until they have
 * played a spread of people.
 *
 * Keeping it out of the rating path matters: a rating is a measurement, and
 * we do not distort the measurement to punish a scheduling habit. We only
 * decline to rank it.
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
   * Recompute eligibility for every player.
   *
   * Runs on a cron rather than after each match, because the window is
   * rolling: a player can become ineligible purely through the passage of
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
      const distinctOpponents = counts.length;
      const diversityScore = shannonDiversity(counts);

      const isRankingEligible =
        distinctOpponents >= MIN_DISTINCT_OPPONENTS &&
        diversityScore >= MIN_DIVERSITY_SCORE;

      await this.playerRepository.update(player.id, {
        isRankingEligible,
        distinctOpponents21d: distinctOpponents,
        diversityScore21d: diversityScore,
      });
      updated += 1;
    }

    this.logger.log(`Refreshed ranking eligibility for ${updated} players`);
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
