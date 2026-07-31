import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongPlayersService } from './pingpong-players.service';

/**
 * Records where everyone stood at the start of the week.
 *
 * The leaderboard shows movement against this, not against yesterday. In a
 * 25-person pool playing a few matches a day, a daily arrow renders
 * sampling noise as if it were signal — Elo's uncertainty scales with the
 * square root of players over games, and Lichess declines to rank anyone at
 * all until their deviation drops below 75 for the same reason.
 *
 * Weekly is slow enough that a movement means something happened, and fast
 * enough to still feel like feedback.
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
   * Freeze the current ranks as the week's starting position.
   *
   * @returns how many players were captured
   */
  async captureWeeklyRanks(): Promise<number> {
    // Read the ranks the leaderboard computed rather than deriving them
    // again: two sources of truth for the same ordering would drift the
    // first time a threshold changed on one side.
    const board = await this.playersService.getLeaderboard();

    for (const player of board) {
      await this.playerRepository.update(player.id, {
        // Null for anyone unranked. Storing 0, or skipping them, would make
        // their first ranked week look like a leap from the bottom.
        previousWeekRank: player.rank,
      });
    }

    this.logger.log(
      `Captured weekly ping-pong ranks for ${board.length} players`,
    );
    return board.length;
  }
}
