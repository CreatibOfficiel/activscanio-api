import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { UserStreak } from './entities/user-streak.entity';
import { XPHistory } from './entities/xp-history.entity';
import { LevelReward } from './entities/level-reward.entity';
import { AchievementSeedService } from './services/achievement-seed.service';
import { StreakTrackerService } from './services/streak-tracker.service';
import { XPLevelService } from './services/xp-level.service';
import { AchievementCalculatorService } from './services/achievement-calculator.service';
import { DailyBonusService } from './services/daily-bonus.service';
import { LevelRewardsService } from './services/level-rewards.service';
import { TemporaryAchievementService } from './services/temporary-achievement.service';
import { AchievementCronService } from './services/achievement-cron.service';
import { AchievementsController } from './achievements.controller';
import { User } from '../users/user.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { DailyUserStats } from '../betting/entities/daily-user-stats.entity';
import { UsersModule } from '../users/users.module';
import { BettingModule } from '../betting/betting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      UserAchievement,
      UserStreak,
      XPHistory,
      LevelReward,
      DailyUserStats,
      User,
      BettorRanking,
      Bet,
      BettingWeek,
    ]),
    UsersModule,
    forwardRef(() => BettingModule),
  ],
  controllers: [AchievementsController],
  providers: [
    AchievementSeedService,
    StreakTrackerService,
    XPLevelService,
    AchievementCalculatorService,
    DailyBonusService,
    LevelRewardsService,
    TemporaryAchievementService,
    AchievementCronService,
  ],
  exports: [
    AchievementSeedService,
    StreakTrackerService,
    XPLevelService,
    AchievementCalculatorService,
    DailyBonusService,
    LevelRewardsService,
    TemporaryAchievementService,
    AchievementCronService,
    TypeOrmModule,
  ],
})
export class AchievementsModule {}
