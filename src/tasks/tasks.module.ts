import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Competitor } from '../competitors/competitor.entity';
import { CompetitorMonthlyStats } from '../betting/entities/competitor-monthly-stats.entity';
import { RaceResult } from '../races/race-result.entity';
import { User } from '../users/user.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { BettingModule } from '../betting/betting.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitor, CompetitorMonthlyStats, RaceResult, User, BettingWeek]),
    BettingModule,
    CompetitorsModule,
    SeasonsModule,
    AchievementsModule,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
