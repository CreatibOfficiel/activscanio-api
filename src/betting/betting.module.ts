import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BettingService } from './betting.service';
import { BettingController } from './betting.controller';
import { BettingWeek } from './entities/betting-week.entity';
import { Bet } from './entities/bet.entity';
import { BetPick } from './entities/bet-pick.entity';
import { CompetitorOdds } from './entities/competitor-odds.entity';
import { BettorRanking } from './entities/bettor-ranking.entity';
import { CompetitorMonthlyStats } from './entities/competitor-monthly-stats.entity';
import { DailyUserStats } from './entities/daily-user-stats.entity';
import { OddsCalculatorService } from './services/odds-calculator.service';
import { WeekManagerService } from './services/week-manager.service';
import { BettingFinalizerService } from './services/betting-finalizer.service';
import { RankingsService } from './services/rankings.service';
import { AdvancedStatsService } from './services/advanced-stats.service';
import { DailyStatsTrackerService } from './services/daily-stats-tracker.service';
import { DailyStatsCronService } from './services/daily-stats-cron.service';
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
import { User } from '../users/user.entity';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { Achievement } from '../achievements/entities/achievement.entity';
import { UsersModule } from '../users/users.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { ImageGenerationModule } from '../image-generation/image-generation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BettingWeek,
      Bet,
      BetPick,
      CompetitorOdds,
      BettorRanking,
      CompetitorMonthlyStats,
      DailyUserStats,
      Competitor,
      RaceEvent,
      RaceResult,
      User,
      UserAchievement,
      Achievement,
    ]),
    ScheduleModule.forRoot(),
    UsersModule,
    forwardRef(() => AchievementsModule),
    ImageGenerationModule,
  ],
  controllers: [BettingController],
  providers: [
    BettingService,
    OddsCalculatorService,
    WeekManagerService,
    BettingFinalizerService,
    RankingsService,
    AdvancedStatsService,
    DailyStatsTrackerService,
    DailyStatsCronService,
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
    RankingsService,
    AdvancedStatsService,
    DailyStatsTrackerService,
    BettingWeekRepository,
    BetRepository,
    BetPickRepository,
    CompetitorOddsRepository,
    BettorRankingRepository,
    CompetitorMonthlyStatsRepository,
  ],
})
export class BettingModule {}
