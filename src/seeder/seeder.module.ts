import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder.service';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { User } from 'src/users/user.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import { RaceEvent } from 'src/races/race-event.entity';
import { RaceResult } from 'src/races/race-result.entity';
import { SeasonArchive } from 'src/seasons/entities/season-archive.entity';
import { ArchivedCompetitorRanking } from 'src/seasons/entities/archived-competitor-ranking.entity';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BaseCharacter,
      CharacterVariant,
      User,
      Competitor,
      RaceEvent,
      RaceResult,
      SeasonArchive,
      ArchivedCompetitorRanking,
    ]),
    AchievementsModule,
  ],
  providers: [SeederService],
})
export class SeederModule {}
