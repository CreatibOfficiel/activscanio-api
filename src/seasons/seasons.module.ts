import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeasonsService } from './seasons.service';
import { SeasonsController } from './seasons.controller';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { ArchivedPingpongRanking } from './entities/archived-pingpong-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';
import { PingpongPlayer } from '../pingpong/entities/pingpong-player.entity';
import { PingpongMatch } from '../pingpong/entities/pingpong-match.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeasonArchive,
      ArchivedCompetitorRanking,
      ArchivedPingpongRanking,
      Competitor,
      // Read inside the archiving transaction; the ping-pong services are not
      // imported, so there is no path from here into its rating engine.
      PingpongPlayer,
      PingpongMatch,
    ]),
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
