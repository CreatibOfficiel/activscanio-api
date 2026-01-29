import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder.service';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { User } from 'src/users/user.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import { BettingWeek } from 'src/betting/entities/betting-week.entity';
import { Bet } from 'src/betting/entities/bet.entity';
import { BetPick } from 'src/betting/entities/bet-pick.entity';
import { CompetitorOdds } from 'src/betting/entities/competitor-odds.entity';
import { BettorRanking } from 'src/betting/entities/bettor-ranking.entity';
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
      BettingWeek,
      Bet,
      BetPick,
      CompetitorOdds,
      BettorRanking,
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
