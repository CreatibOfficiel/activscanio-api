import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import {
  PingpongMatch,
  PingpongSetScore,
} from '../entities/pingpong-match.entity';
import { PingpongRatingService } from './pingpong-rating.service';
import { computePairWeight } from '../utils/pairing-weight';
import { validateMatchSets } from '../utils/pingpong-classification';

export interface RecordMatchDto {
  playerAId: string;
  playerBId: string;
  /** Set scores from player A's point of view. Two or three. */
  sets: PingpongSetScore[];
  playedAt?: Date;
}

@Injectable()
export class PingpongMatchService {
  private readonly logger = new Logger(PingpongMatchService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ratingService: PingpongRatingService,
  ) {}

  /**
   * Record a match and update both players, in one transaction.
   *
   * Order matters and is deliberate:
   *   1. validate the sets — reject before touching anything
   *   2. load both players and lock them
   *   3. count this pair's matches this ISO week → anti-farming weight
   *   4. compute the new ratings (the 250-point freeze lives in the rating service)
   *   5. persist the match and both players together
   *
   * Steps 3 and 4 are separate on purpose: the pairing weight is a property of
   * the schedule, the freeze is a property of the ratings. Mixing them would
   * make either one impossible to reason about alone.
   */
  async recordMatch(dto: RecordMatchDto): Promise<PingpongMatch> {
    if (dto.playerAId === dto.playerBId) {
      throw new BadRequestException('A player cannot face themselves');
    }

    const validation = validateMatchSets(dto.sets);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason ?? 'Invalid match');
    }

    const playedAt = dto.playedAt ?? new Date();
    const isoWeek = getISOWeek(playedAt);
    const isoYear = getISOWeekYear(playedAt);
    const pairKey = this.buildPairKey(dto.playerAId, dto.playerBId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock both rows: two matches submitted at once for the same player
      // would otherwise read the same "before" rating and lose one update.
      const playerA = await queryRunner.manager.findOne(PingpongPlayer, {
        where: { id: dto.playerAId },
        lock: { mode: 'pessimistic_write' },
      });
      const playerB = await queryRunner.manager.findOne(PingpongPlayer, {
        where: { id: dto.playerBId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!playerA || !playerB) {
        throw new NotFoundException('Player not found');
      }

      const priorMeetings = await queryRunner.manager.count(PingpongMatch, {
        where: { pairKey, isoYear, isoWeek },
      });
      const weight = computePairWeight(priorMeetings);

      const rated = this.ratingService.calculateMatchRating({
        playerA: { rating: playerA.rating, rd: playerA.rd, vol: playerA.vol },
        playerB: { rating: playerB.rating, rd: playerB.rd, vol: playerB.vol },
        winner: validation.winner === 'A' ? 'A' : 'B',
        weight,
      });

      const winnerId =
        validation.winner === 'A' ? playerA.id : playerB.id;

      const match = queryRunner.manager.create(PingpongMatch, {
        playerAId: playerA.id,
        playerBId: playerB.id,
        winnerId,
        sets: dto.sets,
        setsA: validation.setsA,
        setsB: validation.setsB,
        playedAt,
        pairKey,
        isoYear,
        isoWeek,
        appliedWeight: weight,
        ratingFrozen: rated.ratingFrozen,
        ratingABefore: playerA.rating,
        ratingAAfter: rated.playerA.rating,
        rdABefore: playerA.rd,
        rdAAfter: rated.playerA.rd,
        ratingBBefore: playerB.rating,
        ratingBAfter: rated.playerB.rating,
        rdBBefore: playerB.rd,
        rdBAfter: rated.playerB.rd,
      });

      await queryRunner.manager.save(PingpongMatch, match);

      this.applyOutcome(playerA, rated.playerA, weight, {
        won: validation.winner === 'A',
        setsWon: validation.setsA,
        setsLost: validation.setsB,
        playedAt,
      });
      this.applyOutcome(playerB, rated.playerB, weight, {
        won: validation.winner === 'B',
        setsWon: validation.setsB,
        setsLost: validation.setsA,
        playedAt,
      });

      await queryRunner.manager.save(PingpongPlayer, playerA);
      await queryRunner.manager.save(PingpongPlayer, playerB);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Match recorded: ${playerA.id} ${validation.setsA}-${validation.setsB} ${playerB.id} (weight ${weight})`,
      );

      return match;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Canonical pair identifier, so a pair reads the same whichever side each
   * player took. Without it, counting a pair's weekly meetings needs an
   * unindexable bidirectional OR.
   */
  private buildPairKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  }

  private applyOutcome(
    player: PingpongPlayer,
    rated: { rating: number; rd: number; vol: number },
    weight: number,
    outcome: {
      won: boolean;
      setsWon: number;
      setsLost: number;
      playedAt: Date;
    },
  ): void {
    player.rating = rated.rating;
    player.rd = rated.rd;
    player.vol = rated.vol;

    // Every match counts towards the displayed total, even at zero weight.
    // Only the weighted count moves calibration, so farming the same opponent
    // inflates the stats without shortening the road to a confirmed rating.
    player.matchCount += 1;
    player.weightedMatchCount += weight;

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
}
