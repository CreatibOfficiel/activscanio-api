import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeasonsService } from './seasons.service';
import { SeasonsController } from './seasons.controller';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeasonArchive,
      ArchivedCompetitorRanking,
      Competitor,
      BettingWeek,
      Bet,
      BettorRanking,
    ]),
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
