import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BettingService } from './betting.service';
import { BettingController } from './betting.controller';
import { BettingWeek } from './entities/betting-week.entity';
import { Bet } from './entities/bet.entity';
import { BetPick } from './entities/bet-pick.entity';
import { CompetitorOdds } from './entities/competitor-odds.entity';
import { BettorRanking } from './entities/bettor-ranking.entity';
import { CompetitorMonthlyStats } from './entities/competitor-monthly-stats.entity';
import { OddsCalculatorService } from './services/odds-calculator.service';
import { WeekManagerService } from './services/week-manager.service';
import { BettingFinalizerService } from './services/betting-finalizer.service';
import { RaceCreatedListener } from './listeners/race-created.listener';
import { BettingWeekRepository } from './repositories/betting-week.repository';
import { BetRepository } from './repositories/bet.repository';
import { BetPickRepository } from './repositories/bet-pick.repository';
import { CompetitorOddsRepository } from './repositories/competitor-odds.repository';
import { BettorRankingRepository } from './repositories/bettor-ranking.repository';
import { CompetitorMonthlyStatsRepository } from './repositories/competitor-monthly-stats.repository';
import { Competitor } from '../competitors/competitor.entity';
import { RaceEvent } from '../races/race-event.entity';
import { RaceResult } from '../races/race-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BettingWeek,
      Bet,
      BetPick,
      CompetitorOdds,
      BettorRanking,
      CompetitorMonthlyStats,
      Competitor,
      RaceEvent,
      RaceResult,
    ]),
  ],
  controllers: [BettingController],
  providers: [
    BettingService,
    OddsCalculatorService,
    WeekManagerService,
    BettingFinalizerService,
    RaceCreatedListener,
    BettingWeekRepository,
    BetRepository,
    BetPickRepository,
    CompetitorOddsRepository,
    BettorRankingRepository,
    CompetitorMonthlyStatsRepository,
  ],
  exports: [
    BettingService,
    OddsCalculatorService,
    WeekManagerService,
    BettingFinalizerService,
    BettingWeekRepository,
    BetRepository,
    BetPickRepository,
    CompetitorOddsRepository,
    BettorRankingRepository,
    CompetitorMonthlyStatsRepository,
  ],
})
export class BettingModule {}
