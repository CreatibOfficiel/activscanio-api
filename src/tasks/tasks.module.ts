import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Competitor } from '../competitors/competitor.entity';
import { CompetitorMonthlyStats } from '../competitors/entities/competitor-monthly-stats.entity';
import { RaceResult } from '../races/race-result.entity';
import { User } from '../users/user.entity';
import { CompetitorsModule } from '../competitors/competitors.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Competitor,
      CompetitorMonthlyStats,
      RaceResult,
      User,
    ]),
    CompetitorsModule,
    SeasonsModule,
    AchievementsModule,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
