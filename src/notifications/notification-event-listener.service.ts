import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { NotificationCategory } from './dto/send-notification.dto';
import {
  AchievementUnlockResult,
  BetFinalizedContext,
} from '../achievements/types/achievement-calculator.types';

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

  @OnEvent('bet.finalized')
  async handleBetFinalized(payload: BetFinalizedContext) {
    try {
      let title: string;
      if (payload.isPerfectPodium) {
        title = 'Podium parfait !';
      } else if (payload.correctPicks > 0) {
        title = 'Resultats de ton prono';
      } else {
        title = 'Prono termine';
      }

      await this.notificationsService.sendNotification({
        userIds: [payload.userId],
        title,
        body: `${payload.pointsEarned} pts - ${payload.correctPicks}/${payload.totalPicks} correct`,
        category: NotificationCategory.BETTING,
        tag: `bet-finalized-${payload.betId}`,
        url: '/betting/history',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send bet finalized notification for user ${payload.userId}`,
        error,
      );
    }
  }

  @OnEvent('perfect.score')
  async handlePerfectScore(payload: {
    userId: string;
    userName: string;
    betId: string;
    weekId: string;
    points: number;
    imageUrl: string;
    celebratedAt: Date;
  }) {
    try {
      await this.notificationsService.sendNotification({
        userIds: [payload.userId],
        title: 'SCORE PARFAIT !',
        body: `Incroyable ${payload.userName} ! 60 points cette semaine !`,
        category: NotificationCategory.BETTING,
        tag: `perfect-score-${payload.betId}`,
        url: '/betting',
        requireInteraction: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send perfect score notification for user ${payload.userId}`,
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

  @OnEvent('duel.created')
  async handleDuelCreated(payload: {
    duel: any;
    challengerUser: any;
    challengedUser: any;
  }) {
    try {
      await this.notificationsService.sendNotification({
        userIds: [payload.duel.challengedUserId],
        title: 'Duel recu !',
        body: `${payload.challengerUser.firstName} t'a defie ! ${payload.duel.stake} pts en jeu. Tu as 1 min pour repondre.`,
        category: NotificationCategory.BETTING,
        tag: `duel-received-${payload.duel.id}`,
        url: '/betting/duels',
        requireInteraction: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send duel created notification`,
        error,
      );
    }
  }

  @OnEvent('duel.resolved')
  async handleDuelResolved(payload: { duel: any }) {
    try {
      const { duel } = payload;
      const winnerId = duel.winnerUserId;
      const loserId = duel.loserUserId;

      await this.notificationsService.sendNotification({
        userIds: [winnerId],
        title: 'Duel gagne !',
        body: `Tu as gagne ton duel ! +${duel.stake} pts`,
        category: NotificationCategory.BETTING,
        tag: `duel-resolved-${duel.id}`,
        url: '/betting/duels',
      });

      await this.notificationsService.sendNotification({
        userIds: [loserId],
        title: 'Duel perdu',
        body: `Tu as perdu ton duel. -${duel.stake} pts`,
        category: NotificationCategory.BETTING,
        tag: `duel-resolved-${duel.id}`,
        url: '/betting/duels',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send duel resolved notification`,
        error,
      );
    }
  }
}
