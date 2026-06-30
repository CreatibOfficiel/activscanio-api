import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Duel } from './duel.entity';
import { DuelsController } from './duels.controller';
import { DuelsService } from './duels.service';
import { DuelsListener } from './duels.listener';
import { User } from '../users/user.entity';
import { Competitor } from '../competitors/competitor.entity';
import { RaceResult } from '../races/race-result.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { BettingModule } from '../betting/betting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Duel, User, Competitor, RaceResult]),
    NotificationsModule,
    BettingModule,
  ],
  controllers: [DuelsController],
  providers: [DuelsService, DuelsListener],
  exports: [DuelsService],
})
export class DuelsModule {}
