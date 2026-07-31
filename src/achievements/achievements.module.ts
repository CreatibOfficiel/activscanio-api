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
import { LevelRewardsService } from './services/level-rewards.service';
import { TemporaryAchievementService } from './services/temporary-achievement.service';
import { AchievementCronService } from './services/achievement-cron.service';
import { StreakWarningService } from './services/streak-warning.service';
import { AchievementsController } from './achievements.controller';
import { User } from '../users/user.entity';
import { Competitor } from '../competitors/competitor.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      UserAchievement,
      UserStreak,
      XPHistory,
      LevelReward,
      User,
      Competitor,
    ]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [AchievementsController],
  providers: [
    AchievementSeedService,
    StreakTrackerService,
    XPLevelService,
    AchievementCalculatorService,
    LevelRewardsService,
    TemporaryAchievementService,
    AchievementCronService,
    StreakWarningService,
  ],
  exports: [
    AchievementSeedService,
    StreakTrackerService,
    XPLevelService,
    AchievementCalculatorService,
    LevelRewardsService,
    TemporaryAchievementService,
    AchievementCronService,
    StreakWarningService,
    TypeOrmModule,
  ],
})
export class AchievementsModule {}
