import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventsGateway } from './events.gateway';

@Injectable()
export class WebSocketEventListener {
  private readonly logger = new Logger(WebSocketEventListener.name);

  constructor(private readonly eventsGateway: EventsGateway) {}

  /**
   * Listen to achievement unlocked events and relay to WebSocket
   */
  @OnEvent('achievement.unlocked')
  handleAchievementUnlocked(payload: { userId: string; achievement: any }) {
    this.logger.log(
      `Relaying achievement unlock via WebSocket for user ${payload.userId}`,
    );
    this.eventsGateway.emitAchievementUnlocked(
      payload.userId,
      payload.achievement,
    );
  }

  /**
   * Listen to level up events
   */
  @OnEvent('user.levelUp')
  handleLevelUp(payload: { userId: string; newLevel: number; rewards: any[] }) {
    this.logger.log(
      `Relaying level up via WebSocket for user ${payload.userId} to level ${payload.newLevel}`,
    );
    this.eventsGateway.emitLevelUp(payload.userId, {
      newLevel: payload.newLevel,
      rewards: payload.rewards,
    });
  }

  /**
   * Listen to achievement revoked events
   */
  @OnEvent('achievement.revoked')
  handleAchievementRevoked(payload: { userId: string; achievement: any }) {
    this.logger.log(
      `Relaying achievement revoke via WebSocket for user ${payload.userId}`,
    );
    this.eventsGateway.emitAchievementRevoked(
      payload.userId,
      payload.achievement,
    );
  }

  /**
   * Listen to bet finalized events
   */
  @OnEvent('bet.finalized')
  handleBetFinalized(payload: { userId: string; bet: any }) {
    this.logger.log(
      `Relaying bet finalized via WebSocket for user ${payload.userId}`,
    );
    this.eventsGateway.emitBetFinalized(payload.userId, payload.bet);
  }

  /**
   * Listen to perfect score events
   */
  @OnEvent('perfect.score')
  handlePerfectScore(payload: {
    userId: string;
    userName: string;
    betId: string;
    imageUrl: string;
    celebratedAt: Date;
  }) {
    this.logger.log(
      `Relaying perfect score celebration via WebSocket for user ${payload.userId}`,
    );
    this.eventsGateway.emitPerfectScore(payload.userId, {
      userName: payload.userName,
      betId: payload.betId,
      imageUrl: payload.imageUrl,
      celebratedAt: payload.celebratedAt,
      message: '🎉 PERFECT SCORE! You scored 60 points!',
    });
  }

  /**
   * Listen to race created events (broadcast to all)
   */
  @OnEvent('race.created')
  handleRaceCreated(payload: { race: any }) {
    this.logger.log('Broadcasting race created event to all clients');
    this.eventsGateway.broadcastRaceAnnouncement(payload.race);
  }

  /**
   * Listen to race results events (broadcast to all)
   */
  @OnEvent('race.resultsPublished')
  handleRaceResults(payload: { results: any }) {
    this.logger.log('Broadcasting race results to all clients');
    this.eventsGateway.broadcastRaceResults(payload.results);
  }

  /**
   * Listen to weekly rankings updated events (broadcast to all)
   */
  @OnEvent('rankings.updated')
  handleRankingsUpdated(payload: { rankings: any }) {
    this.logger.log('Broadcasting weekly rankings update');
    this.eventsGateway.broadcastWeeklyRankings(payload.rankings);
  }
}
