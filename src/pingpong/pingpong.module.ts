import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { PingpongBestWinService } from './services/pingpong-best-win.service';
import { PingpongDecayService } from './services/pingpong-decay.service';
import { PingpongRankSnapshotService } from './services/pingpong-rank-snapshot.service';
import { PingpongRecomputeService } from './services/pingpong-recompute.service';

/**
 * Ping-pong module.
 *
 * Registers `Competitor` for identity lookups only — it never imports
 * CompetitorsModule, so there is no path from here into the Mario Kart
 * services and no risk of the two rating scales meeting.
 */
@Module({
  imports: [
    // The admin recompute endpoint reads ADMIN_SECRET. ConfigModule is global
    // in this app, but importing it here keeps the module self-sufficient —
    // the module spec compiles it in isolation, and that is the test that
    // catches a missing provider before a deploy does.
    ConfigModule,
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
    PingpongBestWinService,
    PingpongDecayService,
    PingpongRankSnapshotService,
    // One-shot historical repair, driven by an admin endpoint. Not exported:
    // nothing outside this module should be able to rewrite every rating.
    PingpongRecomputeService,
  ],
  exports: [
    PingpongRatingService,
    PingpongPlayersService,
    PingpongEligibilityService,
    // Driven by crons in TasksService: decay weekly, rank capture daily.
    PingpongDecayService,
    PingpongRankSnapshotService,
    // Exported for the achievement engine, which reads per-match feats that
    // no column on the player can hold.
    PingpongHighlightStatsService,
    PingpongBestWinService,
  ],
})
export class PingpongModule {}
