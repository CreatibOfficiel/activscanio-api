/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PingpongMatchService } from '../pingpong-match.service';
import { PingpongRatingService } from '../pingpong-rating.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { PingpongMatch } from '../../entities/pingpong-match.entity';

/**
 * Match recording: validation, anti-farming weight, rating, persistence.
 *
 * The service orchestrates in a strict order — validate, weigh, rate, save —
 * inside one transaction. These tests pin that order's observable effects.
 */
describe('PingpongMatchService', () => {
  let service: PingpongMatchService;
  let playerRepository: Repository<PingpongPlayer>;
  let manager: {
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: typeof manager;
  };

  const PLAYER_A = 'player-a';
  const PLAYER_B = 'player-b';

  function player(id: string, over: Partial<PingpongPlayer> = {}) {
    return {
      id,
      competitorId: `comp-${id}`,
      rating: 1500,
      rd: 200,
      vol: 0.06,
      matchCount: 0,
      weightedMatchCount: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastMatchAt: null,
      ...over,
    } as PingpongPlayer;
  }

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn((entity: unknown, data?: unknown) => data ?? entity),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongMatchService,
        PingpongRatingService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn(), count: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { createQueryRunner: () => queryRunner },
        },
      ],
    }).compile();

    service = module.get(PingpongMatchService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));

    // Both players exist by default.
    manager.findOne.mockImplementation(
      (_e: unknown, opts: { where: { id: string } }) =>
        Promise.resolve(player(opts.where.id)),
    );
  });

  const straightWin = [
    { a: 11, b: 5 },
    { a: 11, b: 3 },
  ];

  describe('validation', () => {
    it('rejects a player facing themselves', async () => {
      await expect(
        service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_A,
          sets: straightWin,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an impossible set score', async () => {
      await expect(
        service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_B,
          sets: [
            { a: 11, b: 5 },
            { a: 11, b: 10 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a third set played after a two-nil', async () => {
      await expect(
        service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_B,
          sets: [...straightWin, { a: 11, b: 4 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unfinished match', async () => {
      await expect(
        service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_B,
          sets: [
            { a: 11, b: 5 },
            { a: 5, b: 11 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown player', async () => {
      manager.findOne.mockResolvedValueOnce(null);
      await expect(
        service.recordMatch({
          playerAId: 'ghost',
          playerBId: PLAYER_B,
          sets: straightWin,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('persists nothing when validation fails', async () => {
      await expect(
        service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_A,
          sets: straightWin,
        }),
      ).rejects.toThrow();

      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('match weight', () => {
    it('gives every match full weight, whatever the pair has already played', async () => {
      // The per-ISO-week pairing rule is gone. Whatever a COUNT of prior
      // meetings would have returned, the weight is 1.
      for (const priorMeetings of [0, 3, 6, 20]) {
        manager.count.mockResolvedValue(priorMeetings);

        const match = await service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_B,
          sets: straightWin,
        });

        expect(match.appliedWeight).toBe(1);
        expect(match.ratingAAfter).not.toBe(match.ratingABefore);
      }
    });

    it('does not query the database for the pair’s weekly meetings at all', async () => {
      // The COUNT existed only to feed the weight. Leaving it in place would
      // be a query per match for a number nothing reads.
      await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: straightWin,
      });

      expect(manager.count).not.toHaveBeenCalled();
    });

    it('keeps matchCount and weightedMatchCount in step', async () => {
      await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: straightWin,
      });

      // save() is called both as save(entity) and save(Entity, data), so read
      // whichever argument carries the payload.
      const calls = manager.save.mock.calls as unknown[][];
      const saved = calls
        .map((c) => (c[1] ?? c[0]) as { matchCount?: number } | undefined)
        .filter(
          (v): v is { matchCount: number; weightedMatchCount: number } =>
            v?.matchCount !== undefined,
        );

      expect(saved.length).toBeGreaterThan(0);
      for (const p of saved) {
        expect(p.matchCount).toBe(1);
        expect(p.weightedMatchCount).toBe(1);
      }
    });

    it('still records the ISO week and pair key for the historical record', async () => {
      const match = await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: straightWin,
        playedAt: new Date('2026-08-03T12:00:00Z'),
      });

      expect(match.isoYear).toBe(2026);
      expect(match.isoWeek).toBe(32);
      expect(match.pairKey).toBeTruthy();
    });

    it('builds a pair key that is stable whichever side each player takes', async () => {
      const first = await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: straightWin,
      });
      const second = await service.recordMatch({
        playerAId: PLAYER_B,
        playerBId: PLAYER_A,
        sets: straightWin,
      });

      expect(first.pairKey).toBe(second.pairKey);
    });
  });

  describe('recorded outcome', () => {
    it('derives the winner from the sets rather than trusting input', async () => {
      const match = await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: [
          { a: 5, b: 11 },
          { a: 11, b: 9 },
          { a: 8, b: 11 },
        ],
      });

      expect(match.winnerId).toBe(PLAYER_B);
      expect(match.setsA).toBe(1);
      expect(match.setsB).toBe(2);
    });

    it('stores the before and after ratings for both players', async () => {
      const match = await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: straightWin,
      });

      expect(match.ratingABefore).toBe(1500);
      expect(match.ratingAAfter).toBeGreaterThan(1500);
      expect(match.ratingBAfter).toBeLessThan(1500);
    });

    it('ignores the set margin when rating', async () => {
      manager.count.mockResolvedValue(0);
      const crushing = await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: [
          { a: 11, b: 0 },
          { a: 11, b: 0 },
        ],
      });

      manager.count.mockResolvedValue(0);
      const narrow = await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: [
          { a: 12, b: 10 },
          { a: 13, b: 11 },
        ],
      });

      expect(crushing.ratingAAfter).toBe(narrow.ratingAAfter);
    });
  });

  describe('transaction', () => {
    it('commits on success', async () => {
      await service.recordMatch({
        playerAId: PLAYER_A,
        playerBId: PLAYER_B,
        sets: straightWin,
      });

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('rolls back and releases when persistence fails midway', async () => {
      manager.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.recordMatch({
          playerAId: PLAYER_A,
          playerBId: PLAYER_B,
          sets: straightWin,
        }),
      ).rejects.toThrow('db down');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  it('never reads the Mario Kart competitor repository', () => {
    // Proof rather than hope: the ping-pong path must not touch competitors.
    expect(playerRepository.find).not.toHaveBeenCalled();
  });
});
