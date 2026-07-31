import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { RacesService } from './races.service';
import { RacesController } from './races.controller';
import { RaceEventRepository } from './repositories/race-event.repository';
import { RaceResultRepository } from './repositories/race-result.repository';
import { RaceBestWinService } from './services/race-best-win.service';

import { CompetitorsModule } from 'src/competitors/competitors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RaceEvent, RaceResult]),
    forwardRef(() => CompetitorsModule),
  ],
  controllers: [RacesController],
  providers: [
    RacesService,
    RaceEventRepository,
    RaceResultRepository,
    RaceBestWinService,
  ],
  exports: [
    RacesService,
    RaceEventRepository,
    RaceResultRepository,
    RaceBestWinService,
  ],
})
export class RacesModule {}
