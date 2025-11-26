import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { RacesService } from './races.service';
import { RacesController } from './races.controller';
import { RaceEventRepository } from './repositories/race-event.repository';
import { RaceResultRepository } from './repositories/race-result.repository';

import { CompetitorsModule } from 'src/competitors/competitors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RaceEvent, RaceResult]),
    CompetitorsModule,
  ],
  controllers: [RacesController],
  providers: [
    RacesService,
    RaceEventRepository,
    RaceResultRepository,
  ],
  exports: [
    RacesService,
    RaceEventRepository,
    RaceResultRepository,
  ],
})
export class RacesModule {}
