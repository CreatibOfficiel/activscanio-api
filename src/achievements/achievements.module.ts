import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { UserStreak } from './entities/user-streak.entity';
import { AchievementSeedService } from './services/achievement-seed.service';
import { StreakTrackerService } from './services/streak-tracker.service';
import { XPLevelService } from './services/xp-level.service';
import { AchievementCalculatorService } from './services/achievement-calculator.service';
import { AchievementsController } from './achievements.controller';
import { User } from '../users/user.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      UserAchievement,
      UserStreak,
      User,
      BettorRanking,
      Bet,
      BettingWeek,
    ]),
    UsersModule,
  ],
  controllers: [AchievementsController],
  providers: [
    AchievementSeedService,
    StreakTrackerService,
    XPLevelService,
    AchievementCalculatorService,
  ],
  exports: [
    AchievementSeedService,
    StreakTrackerService,
    XPLevelService,
    AchievementCalculatorService,
    TypeOrmModule,
  ],
})
export class AchievementsModule {}
