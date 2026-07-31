import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongPlayersService } from './pingpong-players.service';

/**
 * Records where everyone stood at the start of the day.
 *
 * The leaderboard shows movement against this. Daily rather than weekly
 * because of what the movement rule does with it: an arrow is shown only to
 * a player who played within the last two days, so the arrow always points
 * at a match that player actually played. That window only lines up with a
 * rank captured at the start of the day — against a weekly capture, a Sunday
 * match would be compared to a rank frozen the previous Monday, and the
 * arrow would claim credit for six days of other people's results.
 *
 * The noise a daily delta would otherwise carry is handled by the activity
 * window rather than by slowing the capture down: a movement whose owner did
 * not play is filtered out at render time, whatever the cadence.
 */
@Injectable()
export class PingpongRankSnapshotService {
  private readonly logger = new Logger(PingpongRankSnapshotService.name);

  constructor(
    @InjectRepository(PingpongPlayer)
    private readonly playerRepository: Repository<PingpongPlayer>,
    private readonly playersService: PingpongPlayersService,
  ) {}

  /**
   * Freeze the current ranks as the day's starting position.
   *
   * @returns how many players were captured
   */
  async captureDailyRanks(): Promise<number> {
    // Read the ranks the leaderboard computed rather than deriving them
    // again: two sources of truth for the same ordering would drift the
    // first time a threshold changed on one side.
    const board = await this.playersService.getLeaderboard();

    for (const player of board) {
      await this.playerRepository.update(player.id, {
        // Null for anyone unranked. Storing 0, or skipping them, would make
        // their first ranked day look like a leap from the bottom.
        previousDayRank: player.rank,
      });
    }

    this.logger.log(
      `Captured daily ping-pong ranks for ${board.length} players`,
    );
    return board.length;
  }
}
