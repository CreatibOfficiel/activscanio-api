import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiveBet } from './entities/live-bet.entity';
import { LiveBettingController } from './live-betting.controller';
import { LiveBettingService } from './services/live-betting.service';
import { CharacterDetectorService } from './services/character-detector.service';
import { LiveRaceCreatedListener } from './listeners/live-race-created.listener';
import { User } from '../users/user.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';
import { CompetitorOdds } from '../betting/entities/competitor-odds.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { RaceResult } from '../races/race-result.entity';
import { CharacterVariantsModule } from '../character-variants/character-variants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LiveBet,
      User,
      BettorRanking,
      CompetitorOdds,
      BettingWeek,
      RaceResult,
    ]),
    CharacterVariantsModule,
  ],
  controllers: [LiveBettingController],
  providers: [LiveBettingService, CharacterDetectorService, LiveRaceCreatedListener],
  exports: [LiveBettingService],
})
export class LiveBettingModule {}
