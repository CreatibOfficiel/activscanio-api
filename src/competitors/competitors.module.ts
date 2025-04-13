import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Competitor } from './competitor.entity';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';
import { RacesModule } from 'src/races/races.module';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitor, CharacterVariant]),
    forwardRef(() => RacesModule),
  ],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
  exports: [CompetitorsService],
})
export class CompetitorsModule {}
