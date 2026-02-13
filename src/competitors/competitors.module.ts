import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Competitor } from './competitor.entity';
import { CompetitorEloSnapshot } from './entities/competitor-elo-snapshot.entity';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';
import { CompetitorRepository } from './repositories/competitor.repository';
import { CompetitorEloSnapshotRepository } from './repositories/competitor-elo-snapshot.repository';
import { RaceResult } from '../races/race-result.entity';
import { RaceResultRepository } from '../races/repositories/race-result.repository';
import { RacesModule } from 'src/races/races.module';
import { RatingModule } from 'src/rating/rating.module';
import { UsersModule } from 'src/users/users.module';
import { BettingModule } from 'src/betting/betting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitor, CompetitorEloSnapshot, RaceResult]),
    forwardRef(() => RacesModule),
    BettingModule,
    RatingModule,
    UsersModule,
  ],
  controllers: [CompetitorsController],
  providers: [CompetitorsService, CompetitorRepository, CompetitorEloSnapshotRepository, RaceResultRepository],
  exports: [CompetitorsService, CompetitorRepository, CompetitorEloSnapshotRepository],
})
export class CompetitorsModule {}
