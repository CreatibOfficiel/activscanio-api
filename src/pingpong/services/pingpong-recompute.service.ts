import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { PingpongRatingService } from './pingpong-rating.service';
import { buildPairKey, MATCH_WEIGHT } from '../utils/pairing-weight';
import {
  applyMatchOutcome,
  PingpongPlayerState,
} from '../utils/apply-match-outcome';

export interface RecomputeOptions {
  /** Compute and report, then roll back. Nothing is written. */
  dryRun?: boolean;
}

/** One player's state before and after the replay. */
export interface PlayerRecomputeRow {
  playerId: string;
  competitorId: string;
  before: PingpongPlayerState;
  after: PingpongPlayerState;
  /** Rating movement, positive or negative. The headline of the report. */
  delta: number;
}

/** One match's recomputed audit trail. */
export interface MatchRecomputeRow {
  id: string;
  playedAt: Date;
  playerAId: string;
  playerBId: string;
  appliedWeight: number;
  ratingFrozen: boolean;
  ratingABefore: number;
  ratingAAfter: number;
  rdABefore: number;
  rdAAfter: number;
  ratingBBefore: number;
  ratingBAfter: number;
  rdBBefore: number;
  rdBAfter: number;
}

export interface RecomputeReport {
  dryRun: boolean;
  playersRecomputed: number;
  matchesReplayed: number;
  players: PlayerRecomputeRow[];
  matches: MatchRecomputeRow[];
}

/**
 * Replay the whole ping-pong history from defaults.
 *
 * WHY THIS EXISTS: removing the rating freeze changed the maths for matches
 * that were already recorded. Without a replay, the leaderboard keeps showing
 * ratings produced by a rule that no longer exists, and every match row's
 * stored before/after columns contradict them. Seven of the fifteen matches on
 * record were frozen, so this is not a rounding difference.
 *
 * WHAT IT MUST NOT DO: reimplement anything. The rating maths comes from
 * PingpongRatingService, the per-player bookkeeping from applyMatchOutcome,
 * the weight from MATCH_WEIGHT and the pair identity from buildPairKey — the
 * same four the live path uses. A recompute with its own copy of any of them
 * drifts from the live path, and then produces a league that no subsequent
 * match can reproduce.
 *
 * This used to be considerably harder. While the per-ISO-week pairing weight
 * existed, a replay could not simply read each row's stored `appliedWeight` —
 * those were outputs of the run being replaced — so the weekly per-pair
 * counters had to be rebuilt as the replay walked forward. Removing that rule
 * removed the whole problem: every match now weighs 1, and the replay is a
 * straight chronological fold.
 *
 * `pairKey`, `isoYear` and `isoWeek` are still rewritten from `playedAt`,
 * because the stored values were written by the old run and the columns are
 * meant to be a faithful record of when each match happened.
 */
@Injectable()
export class PingpongRecomputeService {
  private readonly logger = new Logger(PingpongRecomputeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ratingService: PingpongRatingService,
  ) {}

  /**
   * Reset every player and replay every match, in one transaction.
   *
   * Idempotent: the result depends only on the match rows and the defaults,
   * never on the player state it happens to find. Running it twice lands on
   * the same numbers.
   */
  async recompute(options: RecomputeOptions = {}): Promise<RecomputeReport> {
    const dryRun = options.dryRun ?? false;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const report = await this.replay(queryRunner.manager, dryRun);

      // A dry run still runs inside the transaction and still touches nothing,
      // because rolling back is a stronger guarantee than remembering not to
      // call save() on every future code path through here.
      if (dryRun) {
        await queryRunner.rollbackTransaction();
      } else {
        await queryRunner.commitTransaction();
      }

      this.logger.log(
        `Recompute ${dryRun ? '(dry run) ' : ''}replayed ` +
          `${report.matchesReplayed} matches over ${report.playersRecomputed} players`,
      );

      return report;
    } catch (error) {
      // A half-replayed league is worse than the state we started from.
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async replay(
    manager: EntityManager,
    dryRun: boolean,
  ): Promise<RecomputeReport> {
    const players = await manager.find(PingpongPlayer);
    const matches = await manager.find(PingpongMatch);

    const defaults = this.ratingService.getDefaultRatings();

    // Snapshot what each player looked like before, for the report, and reset
    // the working copy to defaults. The reset is the whole basis of
    // idempotence: the replay must not read the state it is about to replace.
    const before = new Map<string, PingpongPlayerState>();
    const state = new Map<string, PingpongPlayerState>();

    for (const player of players) {
      before.set(player.id, this.snapshot(player));
      state.set(player.id, {
        rating: defaults.rating,
        rd: defaults.rd,
        vol: defaults.vol,
        matchCount: 0,
        weightedMatchCount: 0,
        // NOT replayed, and not zeroed: this counts the current season only,
        // while the replay walks every match ever played. Rebuilding it here
        // would set it to the lifetime total and hand the next season reset a
        // squish for players who have not played in months. Carried through
        // untouched — the season transition owns this column.
        currentSeasonMatchCount: player.currentSeasonMatchCount,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastMatchAt: null,
      });
    }

    const ordered = this.chronological(matches);
    const matchRows: MatchRecomputeRow[] = [];

    for (const match of ordered) {
      const playerA = state.get(match.playerAId);
      const playerB = state.get(match.playerBId);

      // A match whose players are missing cannot be replayed, and skipping it
      // silently would produce a league quietly missing results. Refuse.
      if (!playerA || !playerB) {
        throw new Error(
          `Cannot replay match ${match.id}: player ` +
            `${!playerA ? match.playerAId : match.playerBId} not found`,
        );
      }

      const playedAt = new Date(match.playedAt);
      const weight = MATCH_WEIGHT;

      // The winner is re-derived from the stored set counts rather than from
      // winnerId, so the audit trail is rebuilt from the scores themselves.
      const aWon = match.setsA > match.setsB;

      const ratingABefore = playerA.rating;
      const rdABefore = playerA.rd;
      const ratingBBefore = playerB.rating;
      const rdBBefore = playerB.rd;

      const rated = this.ratingService.calculateMatchRating({
        playerA: { rating: playerA.rating, rd: playerA.rd, vol: playerA.vol },
        playerB: { rating: playerB.rating, rd: playerB.rd, vol: playerB.vol },
        winner: aWon ? 'A' : 'B',
        weight,
      });

      applyMatchOutcome(playerA, rated.playerA, weight, {
        won: aWon,
        setsWon: match.setsA,
        setsLost: match.setsB,
        playedAt,
      });
      applyMatchOutcome(playerB, rated.playerB, weight, {
        won: !aWon,
        setsWon: match.setsB,
        setsLost: match.setsA,
        playedAt,
      });

      matchRows.push({
        id: match.id,
        playedAt,
        playerAId: match.playerAId,
        playerBId: match.playerBId,
        appliedWeight: weight,
        // False on every recomputed row. The column stays because rows written
        // under the old rule are the record of what actually happened, but a
        // row this replay produced was not frozen.
        ratingFrozen: false,
        ratingABefore,
        ratingAAfter: playerA.rating,
        rdABefore,
        rdAAfter: playerA.rd,
        ratingBBefore,
        ratingBAfter: playerB.rating,
        rdBBefore,
        rdBAfter: playerB.rd,
      });
    }

    if (!dryRun) {
      await this.persist(manager, players, state, ordered, matchRows);
    }

    const playerRows: PlayerRecomputeRow[] = players.map((player) => {
      const after = state.get(player.id) as PingpongPlayerState;
      const priorState = before.get(player.id) as PingpongPlayerState;

      return {
        playerId: player.id,
        competitorId: player.competitorId,
        before: priorState,
        after,
        delta: after.rating - priorState.rating,
      };
    });

    return {
      dryRun,
      playersRecomputed: players.length,
      matchesReplayed: ordered.length,
      players: playerRows,
      matches: matchRows,
    };
  }

  /**
   * Matches oldest first, ties broken by id.
   *
   * The tiebreak is not decoration. Matches keyed in after an evening's play
   * all carry one caller-supplied timestamp (`dto.playedAt ?? new Date()`), so
   * sorting on `playedAt` alone leaves their relative order to whatever the
   * storage engine returned — and a replay whose order is not fixed is not
   * idempotent, because each step's rd feeds the next.
   */
  private chronological(matches: PingpongMatch[]): PingpongMatch[] {
    return [...matches].sort((left, right) => {
      const byDate =
        new Date(left.playedAt).getTime() - new Date(right.playedAt).getTime();
      if (byDate !== 0) return byDate;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  }

  private async persist(
    manager: EntityManager,
    players: PingpongPlayer[],
    state: Map<string, PingpongPlayerState>,
    matches: PingpongMatch[],
    matchRows: MatchRecomputeRow[],
  ): Promise<void> {
    const byId = new Map(matchRows.map((row) => [row.id, row]));

    // Matches first, then players. Order is cosmetic inside one transaction,
    // but it keeps a failure's partial write closer to the audit trail it
    // belongs to when reading logs.
    for (const match of matches) {
      const row = byId.get(match.id);
      if (!row) continue;

      Object.assign(match, {
        appliedWeight: row.appliedWeight,
        ratingFrozen: row.ratingFrozen,
        ratingABefore: row.ratingABefore,
        ratingAAfter: row.ratingAAfter,
        rdABefore: row.rdABefore,
        rdAAfter: row.rdAAfter,
        ratingBBefore: row.ratingBBefore,
        ratingBAfter: row.ratingBAfter,
        rdBBefore: row.rdBBefore,
        rdBAfter: row.rdBAfter,
        // Realigned with playedAt: the stored values are outputs of the run
        // being replaced, and the weight above was derived from these.
        pairKey: buildPairKey(match.playerAId, match.playerBId),
        isoYear: getISOWeekYear(row.playedAt),
        isoWeek: getISOWeek(row.playedAt),
      });

      await manager.save(PingpongMatch, match);
    }

    for (const player of players) {
      const after = state.get(player.id);
      if (!after) continue;

      Object.assign(player, after);
      await manager.save(PingpongPlayer, player);
    }
  }

  private snapshot(player: PingpongPlayer): PingpongPlayerState {
    return {
      rating: player.rating,
      rd: player.rd,
      vol: player.vol,
      matchCount: player.matchCount,
      weightedMatchCount: player.weightedMatchCount,
      currentSeasonMatchCount: player.currentSeasonMatchCount,
      wins: player.wins,
      losses: player.losses,
      setsWon: player.setsWon,
      setsLost: player.setsLost,
      currentStreak: player.currentStreak,
      bestStreak: player.bestStreak,
      lastMatchAt: player.lastMatchAt,
    };
  }
}
