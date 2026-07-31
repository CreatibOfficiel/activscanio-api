import { Injectable, Logger } from '@nestjs/common';
import { AchievementUnlockResult } from '../achievements/types/achievement-calculator.types';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { NotificationCategory } from './dto/send-notification.dto';

@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent('achievement.unlocked')
  async handleAchievementUnlocked(payload: {
    userId: string;
    achievement: AchievementUnlockResult;
    unlockedAt: Date;
  }) {
    try {
      await this.notificationsService.sendNotification({
        userIds: [payload.userId],
        title: 'Succes debloque !',
        body: `Tu as obtenu "${payload.achievement.achievementName}" (+${payload.achievement.xpReward} XP)`,
        category: NotificationCategory.ACHIEVEMENTS,
        tag: `achievement-${payload.achievement.achievementKey}`,
        url: '/achievements',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send achievement notification for user ${payload.userId}`,
        error,
      );
    }
  }



  @OnEvent('user.level_up')
  async handleLevelUp(payload: {
    userId: string;
    newLevel: number;
    previousLevel: number;
    totalXP: number;
  }) {
    try {
      await this.notificationsService.sendNotification({
        userIds: [payload.userId],
        title: `Niveau ${payload.newLevel} atteint !`,
        body: `Bravo ! Tu passes du niveau ${payload.previousLevel} au niveau ${payload.newLevel}`,
        category: NotificationCategory.ACHIEVEMENTS,
        tag: `level-up-${payload.newLevel}`,
        url: '/achievements',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send level up notification for user ${payload.userId}`,
        error,
      );
    }
  }


}
