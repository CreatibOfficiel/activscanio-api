import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from './events.gateway';

@Injectable()
export class WebSocketEventListener {
  private readonly logger = new Logger(WebSocketEventListener.name);

  constructor(
    private readonly eventsGateway: EventsGateway,
  ) {}

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
  @OnEvent('user.level_up')
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
   * Listen to betting streak lost events
   */
  @OnEvent('streak.participation_lost')
  handleBettingStreakLost(payload: {
    userId: string;
    lostValue: number;
    lostAt: Date;
  }) {
    this.logger.log(
      `Relaying betting streak lost via WebSocket for user ${payload.userId} (was ${payload.lostValue})`,
    );
    this.eventsGateway.emitStreakLost(payload.userId, {
      type: 'betting',
      lostValue: payload.lostValue,
      lostAt: payload.lostAt,
    });
  }

  /**
   * Listen to play streak lost events
   */
  @OnEvent('streak.play_lost')
  handlePlayStreakLost(payload: {
    userId: string;
    lostValue: number;
    lostAt: Date;
    missedDays?: string[];
  }) {
    this.logger.log(
      `Relaying play streak lost via WebSocket for user ${payload.userId} (was ${payload.lostValue})`,
    );
    this.eventsGateway.emitStreakLost(payload.userId, {
      type: 'play',
      lostValue: payload.lostValue,
      lostAt: payload.lostAt,
      missedDays: payload.missedDays,
    });
  }


  /**
   * Listen to race created events (broadcast to all)
   */
  @OnEvent('race.created')
  handleRaceCreated(payload: { race: any }) {
    this.logger.log('Broadcasting race created event to all clients');
    this.eventsGateway.broadcastRaceAnnouncement({ ...payload.race });
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
   * Listen to competitor created events (broadcast to all)
   */
  @OnEvent('competitor.created')
  handleCompetitorCreated(payload: { competitor: any }) {
    this.logger.log(
      `Broadcasting competitor created event: ${payload.competitor.id}`,
    );
    this.eventsGateway.broadcastCompetitorUpdate(payload.competitor);
  }









}
