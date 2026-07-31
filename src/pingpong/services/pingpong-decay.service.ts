import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';

/** Growth constant: takes a deviation from 50 back to 350 in ~26 weeks. */
export const DECAY_C = 68;
/** Maximum deviation — a fully uncertain rating. */
export const MAX_RD = 350;
/** Days of inactivity before the deviation starts growing again. */
export const DECAY_AFTER_DAYS = 7;

/**
 * Weekly inactivity decay.
 *
 * A rating that has not been tested in a while should not be trusted as much.
 * Glicko-2 handles this natively when ratings are computed in periods, but we
 * update match by match, so nothing widens the deviation on its own. This cron
 * does it.
 *
 * THE DANGEROUS PART: running the formula twice on the same player squares the
 * damage. A deviation of 50 becomes 84 after one run, 108 after two — and the
 * conservative score (rating − 2·rd) drops by over a hundred points. It fails
 * silently: no exception, nothing in the logs, just a leaderboard that quietly
 * stops making sense.
 *
 * Three barriers, in order of reliability:
 *
 *  1. `lastDecayAt` in the WHERE clause of a single atomic UPDATE that also
 *     sets it. There is no window between read and write, so concurrent runs
 *     on separate instances cannot both match the same row.
 *  2. `acquireTaskLock` in TasksService, which stops overlap within a process.
 *  3. `LEAST(..., 350)` caps the result even if the first two somehow failed.
 */
@Injectable()
export class PingpongDecayService {
  private readonly logger = new Logger(PingpongDecayService.name);

  constructor(
    @InjectRepository(PingpongPlayer)
    private readonly playerRepository: Repository<PingpongPlayer>,
  ) {}

  /**
   * Widen the deviation of every player idle for more than a week.
   *
   * @returns how many players were touched
   */
  async runDecay(): Promise<number> {
    const rows = await this.playerRepository.query(`
      UPDATE "pingpong_players"
      SET "rd" = LEAST(sqrt("rd" * "rd" + ${DECAY_C} * ${DECAY_C}), ${MAX_RD}),
          "lastDecayAt" = now()
      WHERE "lastMatchAt" IS NOT NULL
        AND "lastMatchAt" < now() - interval '${DECAY_AFTER_DAYS} days'
        AND "rd" < ${MAX_RD}
        AND ("lastDecayAt" IS NULL
             OR "lastDecayAt" < now() - interval '${DECAY_AFTER_DAYS} days')
      RETURNING "id"
    `);

    const count = Array.isArray(rows) ? rows.length : 0;
    this.logger.log(`Inactivity decay applied to ${count} ping-pong players`);
    return count;
  }
}
