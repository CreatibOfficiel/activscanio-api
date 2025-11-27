import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Competitor } from './competitor.entity';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';
import { CompetitorRepository } from './repositories/competitor.repository';
import { RacesModule } from 'src/races/races.module';
import { RatingModule } from 'src/rating/rating.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitor]),
    forwardRef(() => RacesModule),
    RatingModule,
  ],
  controllers: [CompetitorsController],
  providers: [
    CompetitorsService,
    CompetitorRepository,
  ],
  exports: [
    CompetitorsService,
    CompetitorRepository,
  ],
})
export class CompetitorsModule {}
