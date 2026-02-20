import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Duel } from './duel.entity';
import { DuelsController } from './duels.controller';
import { DuelsService } from './duels.service';
import { DuelsListener } from './duels.listener';
import { User } from '../users/user.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';
import { RaceResult } from '../races/race-result.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Duel, User, BettorRanking, RaceResult]),
    NotificationsModule,
  ],
  controllers: [DuelsController],
  providers: [DuelsService, DuelsListener],
  exports: [DuelsService],
})
export class DuelsModule {}
