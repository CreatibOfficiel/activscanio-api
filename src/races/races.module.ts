import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { RacesService } from './races.service';
import { RacesController } from './races.controller';

import { CompetitorsModule } from 'src/competitors/competitors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RaceEvent, RaceResult]),
    forwardRef(() => CompetitorsModule),
  ],
  controllers: [RacesController],
  providers: [RacesService],
  exports: [RacesService],
})
export class RacesModule {}
