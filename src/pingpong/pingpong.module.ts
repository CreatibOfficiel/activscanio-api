import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PingpongController } from './pingpong.controller';
import { PingpongPlayer } from './entities/pingpong-player.entity';
import { PingpongMatch } from './entities/pingpong-match.entity';
import { PingpongEloSnapshot } from './entities/pingpong-elo-snapshot.entity';
import { Competitor } from '../competitors/competitor.entity';
import { PingpongRatingService } from './services/pingpong-rating.service';
import { PingpongMatchService } from './services/pingpong-match.service';
import { PingpongPlayersService } from './services/pingpong-players.service';
import { PingpongEligibilityService } from './services/pingpong-eligibility.service';
import { PingpongHighlightStatsService } from './services/pingpong-highlight-stats.service';

/**
 * Ping-pong module.
 *
 * Registers `Competitor` for identity lookups only — it never imports
 * CompetitorsModule, so there is no path from here into the Mario Kart
 * services and no risk of the two rating scales meeting.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PingpongPlayer,
      PingpongMatch,
      PingpongEloSnapshot,
      Competitor,
    ]),
  ],
  controllers: [PingpongController],
  providers: [
    PingpongRatingService,
    PingpongMatchService,
    PingpongPlayersService,
    PingpongEligibilityService,
    PingpongHighlightStatsService,
  ],
  exports: [
    PingpongRatingService,
    PingpongPlayersService,
    PingpongEligibilityService,
    // Exported for the achievement engine, which reads per-match feats that
    // no column on the player can hold.
    PingpongHighlightStatsService,
  ],
})
export class PingpongModule {}
