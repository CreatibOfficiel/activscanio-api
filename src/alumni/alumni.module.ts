import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Competitor } from '../competitors/competitor.entity';
import { User } from '../users/user.entity';
import { NotificationPreferences } from '../notifications/notification-preferences.entity';
import { AlumniReminderDelivery } from './alumni-reminder-delivery.entity';
import { AlumniController } from './alumni.controller';
import { AlumniService } from './alumni.service';

@Module({
  imports: [TypeOrmModule.forFeature([Competitor, User, NotificationPreferences, AlumniReminderDelivery])],
  controllers: [AlumniController],
  providers: [AlumniService],
})
export class AlumniModule {}
