/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private userSockets = new Map<string, string>(); // userId -> socketId

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove from userSockets map
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        this.logger.log(`User ${userId} unregistered from WebSocket`);
        break;
      }
    }
  }

  /**
   * Client registers their userId to receive personalized events
   */
  @SubscribeMessage('register')
  handleRegister(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.userSockets.set(userId, client.id);
    this.logger.log(`User ${userId} registered with socket ${client.id}`);
    client.emit('registered', { success: true, userId });
  }

  /**
   * Emit achievement unlocked event to specific user
   */
  emitAchievementUnlocked(userId: string, achievement: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('achievement:unlocked', achievement);
      this.logger.log(`Sent achievement unlock to user ${userId}`);
    } else {
      this.logger.warn(`User ${userId} not connected to WebSocket`);
    }
  }

  /**
   * Emit level up event to specific user
   */
  emitLevelUp(userId: string, data: { newLevel: number; rewards: any[] }) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('level:up', data);
      this.logger.log(
        `Sent level up to user ${userId}: Level ${data.newLevel}`,
      );
    }
  }

  /**
   * Emit achievement revoked event to specific user
   */
  emitAchievementRevoked(userId: string, achievement: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('achievement:revoked', achievement);
      this.logger.log(`Sent achievement revoked to user ${userId}`);
    }
  }

  /**
   * Emit bet finalized event to specific user
   */
  emitBetFinalized(userId: string, bet: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('bet:finalized', bet);
      this.logger.log(`Sent bet finalized to user ${userId}`);
    }
  }

  /**
   * Emit perfect score celebration event to specific user
   */
  emitPerfectScore(userId: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('perfect:score', data);
      this.logger.log(`Sent perfect score celebration to user ${userId}`);
    }
  }

  /**
   * Emit streak lost event to specific user
   */
  emitStreakLost(
    userId: string,
    data: { type: 'betting' | 'play'; lostValue: number; lostAt: Date },
  ) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('streak:lost', data);
      this.logger.log(
        `Sent ${data.type} streak lost to user ${userId} (was ${data.lostValue})`,
      );
    }
  }

  /**
   * Broadcast to all connected clients (e.g., race announcements)
   */
  broadcastRaceAnnouncement(race: any) {
    this.server.emit('race:announcement', race);
    this.logger.log(`Broadcasted race announcement: ${race.title || race.id}`);
  }

  /**
   * Broadcast race results to all users
   */
  broadcastRaceResults(results: any) {
    this.server.emit('race:results', results);
    this.logger.log('Broadcasted race results to all clients');
  }

  /**
   * Broadcast competitor update to all clients
   */
  broadcastCompetitorUpdate(competitor: any) {
    this.server.emit('competitor:updated', competitor);
    this.logger.log(
      `Broadcasted competitor update: ${competitor.id}`,
    );
  }

  /**
   * Emit weekly ranking updates to all users
   */
  broadcastWeeklyRankings(rankings: any) {
    this.server.emit('rankings:updated', rankings);
    this.logger.log('Broadcasted weekly rankings update');
  }

  /**
   * Emit duel received event to the challenged user
   */
  emitDuelReceived(userId: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('duel:received', data);
      this.logger.log(`Sent duel:received to user ${userId}`);
    }
  }

  /**
   * Emit duel accepted event to the challenger
   */
  emitDuelAccepted(userId: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('duel:accepted', data);
      this.logger.log(`Sent duel:accepted to user ${userId}`);
    }
  }

  /**
   * Emit duel declined event to the challenger
   */
  emitDuelDeclined(userId: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('duel:declined', data);
      this.logger.log(`Sent duel:declined to user ${userId}`);
    }
  }

  /**
   * Emit duel resolved event to both users + broadcast
   */
  emitDuelResolved(challengerUserId: string, challengedUserId: string, data: any) {
    const challengerSocket = this.userSockets.get(challengerUserId);
    if (challengerSocket) {
      this.server.to(challengerSocket).emit('duel:resolved', data);
    }
    const challengedSocket = this.userSockets.get(challengedUserId);
    if (challengedSocket) {
      this.server.to(challengedSocket).emit('duel:resolved', data);
    }
    this.server.emit('duel:feed', data);
    this.logger.log(`Sent duel:resolved to both users + broadcast`);
  }

  /**
   * Emit duel cancelled event to both users
   */
  emitDuelCancelled(challengerUserId: string, challengedUserId: string, data: any) {
    const challengerSocket = this.userSockets.get(challengerUserId);
    if (challengerSocket) {
      this.server.to(challengerSocket).emit('duel:cancelled', data);
    }
    const challengedSocket = this.userSockets.get(challengedUserId);
    if (challengedSocket) {
      this.server.to(challengedSocket).emit('duel:cancelled', data);
    }
    this.logger.log(`Sent duel:cancelled to both users`);
  }

  /**
   * Get count of connected clients
   */
  getConnectedClientsCount(): number {
    return this.userSockets.size;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}
