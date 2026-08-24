import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';

/** Glicko-2 scale factor, converting a rating step into the internal one. */
const GLICKO_SCALE = 173.7178;

/** Deviation ceiling, the same one the decay caps at. */
const MAX_RD = 350;

/** Where an unproven rating sits, and what the squish pulls toward. */
const DEFAULT_RATING = 1500;

/** Volatility a fresh season starts from. */
const DEFAULT_VOL = 0.06;

/**
 * How long after a reset another one is allowed to touch the same row.
 *
 * A season is four weeks; a day is comfortably shorter than that and
 * comfortably longer than any retry window, so a cron that runs twice in the
 * same transition cannot squish anyone twice.
 */
const RESET_COOLDOWN_HOURS = 24;

export interface PingpongSeasonResetResult {
  active: number;
  inactive: number;
}

/**
 * The end-of-season reset for ping-pong.
 *
 * A deliberate mirror of `CompetitorRepository.resetMonthlyStats`, down to the
 * two paths and the formulas, because the two sports should feel like one
 * league that happens to be played two ways. What is NOT mirrored is the
 * missing idempotency guard: this side takes the `lastSeasonResetAt` approach
 * the decay already uses.
 *
 * 1. ACTIVE (`currentSeasonMatchCount > 0`) — full soft reset:
 *    - rating = 0.75 × rating + 0.25 × 1500
 *    - rd     = min(sqrt(rd² + vol² × 173.7178²), 350)
 *    - vol    = 0.06
 *    - currentSeasonMatchCount = 0, currentStreak = 0
 *
 * 2. INACTIVE (`currentSeasonMatchCount = 0`) — deviation only:
 *    - rating, vol, currentStreak unchanged
 *    - rd     = min(sqrt(rd² + vol² × 173.7178²), 350)
 *
 * Squishing an absent player's rating compounds into a stealth hard reset
 * across missed seasons. The deviation bump alone already says "you have been
 * away, we are less sure" — their first match back swings hard and re-anchors
 * them on its own.
 *
 * NOT reset, deliberately: `matchCount` and `weightedMatchCount` (the latter
 * is the only counter that leaves calibration, so zeroing it would put the
 * whole league back into calibration for weeks and empty the podium),
 * `wins`, `losses`, `setsWon`, `setsLost` and `bestStreak` (lifetime records).
 *
 * Must run AFTER the season archive, which reads these same values.
 */
@Injectable()
export class PingpongSeasonResetService {
  private readonly logger = new Logger(PingpongSeasonResetService.name);

  constructor(
    @InjectRepository(PingpongPlayer)
    private readonly playerRepository: Repository<PingpongPlayer>,
  ) {}

  /**
   * Roll every player into the new season.
   *
   * Both statements carry `lastSeasonResetAt` in the WHERE clause and set it
   * in the same atomic UPDATE, so there is no window between read and write
   * for a concurrent run to slip through.
   */
  async resetSeasonStats(): Promise<PingpongSeasonResetResult> {
    const rdBump = `LEAST(SQRT("rd" * "rd" + "vol" * "vol" * ${GLICKO_SCALE} * ${GLICKO_SCALE}), ${MAX_RD})`;
    const notJustReset =
      `("lastSeasonResetAt" IS NULL` +
      ` OR "lastSeasonResetAt" < now() - interval '${RESET_COOLDOWN_HOURS} hours')`;

    const activeRows: unknown = await this.playerRepository.query(`
      UPDATE "pingpong_players"
      SET "rating" = 0.75 * "rating" + 0.25 * ${DEFAULT_RATING},
          "rd" = ${rdBump},
          "vol" = ${DEFAULT_VOL},
          "currentSeasonMatchCount" = 0,
          "currentStreak" = 0,
          "lastSeasonResetAt" = now()
      WHERE "currentSeasonMatchCount" > 0
        AND ${notJustReset}
      RETURNING "id"
    `);

    const inactiveRows: unknown = await this.playerRepository.query(`
      UPDATE "pingpong_players"
      SET "rd" = ${rdBump},
          "lastSeasonResetAt" = now()
      WHERE "currentSeasonMatchCount" = 0
        AND ${notJustReset}
      RETURNING "id"
    `);

    const active = Array.isArray(activeRows) ? activeRows.length : 0;
    const inactive = Array.isArray(inactiveRows) ? inactiveRows.length : 0;

    this.logger.log(
      `Ping-pong season reset: ${active} active (75/25 squish), ` +
        `${inactive} inactive (RD-only update)`,
    );

    return { active, inactive };
  }
}
