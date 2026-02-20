import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  BettingWeek,
  BettingWeekStatus,
} from '../betting/entities/betting-week.entity';
import { EventsGateway } from './events.gateway';

@Injectable()
export class WebSocketEventListener {
  private readonly logger = new Logger(WebSocketEventListener.name);

  constructor(
    private readonly eventsGateway: EventsGateway,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
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
   * Listen to bet finalized events
   */
  @OnEvent('bet.finalized')
  handleBetFinalized(payload: { userId: string; [key: string]: any }) {
    this.logger.log(
      `Relaying bet finalized via WebSocket for user ${payload.userId}`,
    );
    this.eventsGateway.emitBetFinalized(payload.userId, payload);
  }

  /**
   * Listen to betting streak lost events
   */
  @OnEvent('streak.betting_lost')
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
  }) {
    this.logger.log(
      `Relaying play streak lost via WebSocket for user ${payload.userId} (was ${payload.lostValue})`,
    );
    this.eventsGateway.emitStreakLost(payload.userId, {
      type: 'play',
      lostValue: payload.lostValue,
      lostAt: payload.lostAt,
    });
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
      message: '🎉 SCORE PARFAIT ! Vous avez marqué 60 points !',
    });
  }

  /**
   * Listen to race created events (broadcast to all)
   */
  @OnEvent('race.created')
  async handleRaceCreated(payload: { race: any }) {
    this.logger.log('Broadcasting race created event to all clients');

    let bettingOpen = false;
    try {
      const now = new Date();
      const openWeek = await this.bettingWeekRepository.findOne({
        where: {
          status: BettingWeekStatus.OPEN,
          startDate: LessThanOrEqual(now),
          endDate: MoreThanOrEqual(now),
        },
      });
      bettingOpen = !!openWeek;
    } catch (error) {
      this.logger.error('Failed to check betting week status', error);
    }

    this.eventsGateway.broadcastRaceAnnouncement({
      ...payload.race,
      bettingOpen,
    });
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

  /**
   * Listen to duel created events → notify challenged user
   */
  @OnEvent('duel.created')
  handleDuelCreated(payload: { duel: any; challengerUser: any; challengedUser: any }) {
    this.logger.log(`Relaying duel:received to user ${payload.duel.challengedUserId}`);
    this.eventsGateway.emitDuelReceived(payload.duel.challengedUserId, {
      duelId: payload.duel.id,
      challenger: {
        firstName: payload.challengerUser.firstName,
        lastName: payload.challengerUser.lastName,
        profilePictureUrl: payload.challengerUser.profilePictureUrl,
      },
      stake: payload.duel.stake,
      expiresAt: payload.duel.expiresAt,
    });
  }

  /**
   * Listen to duel accepted events → notify challenger
   */
  @OnEvent('duel.accepted')
  handleDuelAccepted(payload: { duel: any }) {
    this.logger.log(`Relaying duel:accepted to user ${payload.duel.challengerUserId}`);
    this.eventsGateway.emitDuelAccepted(payload.duel.challengerUserId, {
      duelId: payload.duel.id,
    });
  }

  /**
   * Listen to duel declined events → notify challenger
   */
  @OnEvent('duel.declined')
  handleDuelDeclined(payload: { duel: any }) {
    this.logger.log(`Relaying duel:declined to user ${payload.duel.challengerUserId}`);
    this.eventsGateway.emitDuelDeclined(payload.duel.challengerUserId, {
      duelId: payload.duel.id,
    });
  }

  /**
   * Listen to duel resolved events → notify both users + feed
   */
  @OnEvent('duel.resolved')
  handleDuelResolved(payload: { duel: any }) {
    this.logger.log(`Relaying duel:resolved for duel ${payload.duel.id}`);
    this.eventsGateway.emitDuelResolved(
      payload.duel.challengerUserId,
      payload.duel.challengedUserId,
      {
        duelId: payload.duel.id,
        winnerUserId: payload.duel.winnerUserId,
        loserUserId: payload.duel.loserUserId,
        stake: payload.duel.stake,
        raceEventId: payload.duel.raceEventId,
      },
    );
  }

  /**
   * Listen to duel cancelled events → notify both users
   */
  @OnEvent('duel.cancelled')
  handleDuelCancelled(payload: { duel: any; reason: string }) {
    this.logger.log(`Relaying duel:cancelled for duel ${payload.duel.id}`);
    this.eventsGateway.emitDuelCancelled(
      payload.duel.challengerUserId,
      payload.duel.challengedUserId,
      {
        duelId: payload.duel.id,
        reason: payload.reason,
      },
    );
  }
}
