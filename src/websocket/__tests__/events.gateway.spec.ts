/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from '../events.gateway';
import { Socket } from 'socket.io';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockSocket: Partial<Socket>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);

    // Mock Socket
    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should log client connection', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');

      gateway.handleConnection(mockSocket as Socket);

      expect(logSpy).toHaveBeenCalledWith(`Client connected: ${mockSocket.id}`);
    });
  });

  describe('handleRegister', () => {
    it('should register user with socket ID', () => {
      const userId = 'user-123';
      const logSpy = jest.spyOn(gateway['logger'], 'log');

      gateway.handleRegister(userId, mockSocket as Socket);

      expect(logSpy).toHaveBeenCalledWith(
        `User ${userId} registered with socket ${mockSocket.id}`,
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('registered', {
        success: true,
        userId,
      });
    });

    it('should map userId to socketId', () => {
      const userId = 'user-123';

      gateway.handleRegister(userId, mockSocket as Socket);

      expect(gateway.isUserConnected(userId)).toBe(true);
    });
  });

  describe('handleDisconnect', () => {
    it('should remove user from registry on disconnect', () => {
      const userId = 'user-123';

      // First register
      gateway.handleRegister(userId, mockSocket as Socket);
      expect(gateway.isUserConnected(userId)).toBe(true);

      // Then disconnect
      gateway.handleDisconnect(mockSocket as Socket);

      expect(gateway.isUserConnected(userId)).toBe(false);
    });
  });

  describe('emitAchievementUnlocked', () => {
    beforeEach(() => {
      // Mock the server's 'to' method
      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;
    });

    it('should emit achievement to registered user', () => {
      const userId = 'user-123';
      const achievement = {
        id: '1',
        key: 'first_bet',
        name: 'First Bet',
        icon: '🎯',
        xpReward: 10,
      };

      // Register user first
      gateway.handleRegister(userId, mockSocket as Socket);

      // Emit achievement
      gateway.emitAchievementUnlocked(userId, achievement);

      expect(gateway.server.to).toHaveBeenCalledWith(mockSocket.id);
    });

    it('should warn if user is not connected', () => {
      const userId = 'not-connected-user';
      const achievement = { id: '1', name: 'Test' };
      const warnSpy = jest.spyOn(gateway['logger'], 'warn');

      gateway.emitAchievementUnlocked(userId, achievement);

      expect(warnSpy).toHaveBeenCalledWith(
        `User ${userId} not connected to WebSocket`,
      );
    });
  });

  describe('emitLevelUp', () => {
    beforeEach(() => {
      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;
    });

    it('should emit level up event to user', () => {
      const userId = 'user-123';
      const levelData = { newLevel: 5, rewards: [] };

      gateway.handleRegister(userId, mockSocket as Socket);
      gateway.emitLevelUp(userId, levelData);

      expect(gateway.server.to).toHaveBeenCalledWith(mockSocket.id);
    });
  });

  describe('broadcastRaceAnnouncement', () => {
    beforeEach(() => {
      gateway.server = {
        emit: jest.fn(),
      } as any;
    });

    it('should broadcast to all clients', () => {
      const race = { id: '1', title: 'Test Race' };

      gateway.broadcastRaceAnnouncement(race);

      expect(gateway.server.emit).toHaveBeenCalledWith(
        'race:announcement',
        race,
      );
    });
  });

  describe('getConnectedClientsCount', () => {
    it('should return 0 when no clients connected', () => {
      expect(gateway.getConnectedClientsCount()).toBe(0);
    });

    it('should return correct count after registrations', () => {
      gateway.handleRegister('user-1', { id: 'socket-1' } as Socket);
      gateway.handleRegister('user-2', { id: 'socket-2' } as Socket);

      expect(gateway.getConnectedClientsCount()).toBe(2);
    });

    it('should update count after disconnection', () => {
      const socket1 = { id: 'socket-1' } as Socket;
      gateway.handleRegister('user-1', socket1);
      expect(gateway.getConnectedClientsCount()).toBe(1);

      gateway.handleDisconnect(socket1);
      expect(gateway.getConnectedClientsCount()).toBe(0);
    });
  });

  describe('isUserConnected', () => {
    it('should return false for unregistered user', () => {
      expect(gateway.isUserConnected('non-existent-user')).toBe(false);
    });

    it('should return true for registered user', () => {
      const userId = 'user-123';
      gateway.handleRegister(userId, mockSocket as Socket);

      expect(gateway.isUserConnected(userId)).toBe(true);
    });
  });
});
