import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { NotificationPreferences } from './notification-preferences.entity';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationPreferences)
    private notificationPreferencesRepository: Repository<NotificationPreferences>,
    private configService: ConfigService,
  ) {
    // Configure web-push with VAPID keys
    const vapidPublicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidSubject = this.configService.get<string>('VAPID_SUBJECT');

    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      this.logger.log('Web Push configured with VAPID keys');
    } else {
      this.logger.warn(
        'VAPID keys not configured - push notifications disabled',
      );
    }
  }

  /**
   * Get or create notification preferences for a user
   */
  async getOrCreatePreferences(
    userId: string,
  ): Promise<NotificationPreferences> {
    let preferences = await this.notificationPreferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.notificationPreferencesRepository.create({
        userId,
        enablePush: false,
        enableInApp: true,
        categories: {
          betting: true,
          achievements: true,
          rankings: true,
          races: true,
          special: true,
        },
      });
      preferences =
        await this.notificationPreferencesRepository.save(preferences);
    }

    return preferences;
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    updateDto: UpdatePreferencesDto,
  ): Promise<NotificationPreferences> {
    const preferences = await this.getOrCreatePreferences(userId);

    // Merge categories if provided
    if (updateDto.categories) {
      preferences.categories = {
        ...preferences.categories,
        ...updateDto.categories,
      };
    }

    if (updateDto.enablePush !== undefined) {
      preferences.enablePush = updateDto.enablePush;
    }

    if (updateDto.enableInApp !== undefined) {
      preferences.enableInApp = updateDto.enableInApp;
    }

    return await this.notificationPreferencesRepository.save(preferences);
  }

  /**
   * Save push subscription
   */
  async subscribe(
    userId: string,
    subscription: PushSubscriptionDto,
  ): Promise<NotificationPreferences> {
    const preferences = await this.getOrCreatePreferences(userId);
    preferences.pushSubscription = subscription;
    preferences.enablePush = true; // Auto-enable push when subscribing
    return await this.notificationPreferencesRepository.save(preferences);
  }

  /**
   * Remove push subscription
   */
  async unsubscribe(userId: string): Promise<void> {
    const preferences = await this.notificationPreferencesRepository.findOne({
      where: { userId },
    });

    if (preferences) {
      preferences.pushSubscription = null;
      preferences.enablePush = false;
      await this.notificationPreferencesRepository.save(preferences);
    }
  }

  /**
   * Send a notification to one or multiple users
   */
  async sendNotification(dto: SendNotificationDto): Promise<void> {
    const {
      userIds,
      title,
      body,
      category,
      url,
      icon,
      badge,
      tag,
      requireInteraction,
      data,
    } = dto;

    for (const userId of userIds) {
      const preferences = await this.notificationPreferencesRepository.findOne({
        where: { userId },
      });

      if (!preferences) {
        this.logger.warn(`No preferences found for user ${userId}`);
        continue;
      }

      // Check if user has this category enabled
      if (!preferences.categories[category]) {
        this.logger.debug(`User ${userId} has category ${category} disabled`);
        continue;
      }

      // Send push notification if enabled and subscription exists
      if (preferences.enablePush && preferences.pushSubscription) {
        try {
          const payload = JSON.stringify({
            title,
            body,
            icon: icon || '/icons/icon-192x192.png',
            badge: badge || '/icons/icon-72x72.png',
            tag: tag || 'default',
            requireInteraction: requireInteraction || false,
            data: {
              url: url || '/',
              ...data,
            },
          });

          await webpush.sendNotification(preferences.pushSubscription, payload);
          this.logger.log(`Push notification sent to user ${userId}`);
        } catch (error) {
          this.logger.error(
            `Failed to send push notification to user ${userId}:`,
            error.message,
          );

          // If subscription is invalid, remove it
          if (error.statusCode === 410 || error.statusCode === 404) {
            this.logger.warn(
              `Removing invalid subscription for user ${userId}`,
            );
            preferences.pushSubscription = null;
            preferences.enablePush = false;
            await this.notificationPreferencesRepository.save(preferences);
          }
        }
      }
    }
  }

  /**
   * Send a test notification to a user
   */
  async sendTestNotification(userId: string): Promise<void> {
    await this.sendNotification({
      userIds: [userId],
      title: 'Test Notification',
      body: 'This is a test notification from Activscanio!',
      category: 'special' as any,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'test',
      data: {
        test: true,
      },
    });
  }
}
