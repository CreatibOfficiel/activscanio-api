import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeasonsService } from './seasons.service';
import { SeasonsController } from './seasons.controller';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeasonArchive,
      ArchivedCompetitorRanking,
      Competitor,
    ]),
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
