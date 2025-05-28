import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Competitor } from './competitor.entity';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';
import { RacesModule } from 'src/races/races.module';
import { Glicko2Service } from './glicko2.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitor]),
    forwardRef(() => RacesModule),
  ],
  controllers: [CompetitorsController],
  providers: [CompetitorsService, Glicko2Service],
  exports: [CompetitorsService],
})
export class CompetitorsModule {}
