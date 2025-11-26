import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Competitor } from '../competitors/competitor.entity';
import { CompetitorMonthlyStats } from '../betting/entities/competitor-monthly-stats.entity';
import { BettingModule } from '../betting/betting.module';
import { CompetitorsModule } from '../competitors/competitors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitor, CompetitorMonthlyStats]),
    BettingModule,
    CompetitorsModule,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
