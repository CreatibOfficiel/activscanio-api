/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongRankSnapshotService } from '../pingpong-rank-snapshot.service';
import { PingpongPlayersService } from '../pingpong-players.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';

/**
 * Weekly rank snapshot.
 *
 * The leaderboard needs a "you moved up two places" indicator, and the
 * research was specific about the cadence: in a 25-person pool with a few
 * matches a day, a DAILY arrow renders sampling noise as if it were signal.
 * Elo's own uncertainty scales with the square root of players over games,
 * and Lichess refuses to rank anyone at all until their deviation is under
 * 75 for exactly this reason.
 *
 * So this runs weekly, and stores the rank a player held at the start of
 * the week. The delta is then computed against the live rank.
 */
describe('PingpongRankSnapshotService', () => {
  let service: PingpongRankSnapshotService;
  let playerRepository: Repository<PingpongPlayer>;
  let playersService: { getLeaderboard: jest.Mock };

  function ranked(id: string, rank: number | null) {
    return { id, rank };
  }

  beforeEach(async () => {
    playersService = { getLeaderboard: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongRankSnapshotService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { update: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: PingpongPlayersService, useValue: playersService },
      ],
    }).compile();

    service = module.get(PingpongRankSnapshotService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));
  });

  /** Every (id, patch) pair written. */
  function writes(): [string, { previousWeekRank: number | null }][] {
    return (playerRepository.update as jest.Mock).mock.calls as [
      string,
      { previousWeekRank: number | null },
    ][];
  }

  it('stores the rank each player currently holds', async () => {
    playersService.getLeaderboard.mockResolvedValue([
      ranked('a', 1),
      ranked('b', 2),
    ]);

    await service.captureWeeklyRanks();

    expect(writes()).toEqual([
      ['a', { previousWeekRank: 1 }],
      ['b', { previousWeekRank: 2 }],
    ]);
  });

  it('stores null for a player who carries no rank', async () => {
    // Someone still calibrating has no position to move from. Storing 0 or
    // omitting them would make their first ranked week look like a jump
    // from the bottom of the table.
    playersService.getLeaderboard.mockResolvedValue([ranked('new', null)]);

    await service.captureWeeklyRanks();

    expect(writes()).toEqual([['new', { previousWeekRank: null }]]);
  });

  it('reports how many players it captured', async () => {
    playersService.getLeaderboard.mockResolvedValue([
      ranked('a', 1),
      ranked('b', null),
    ]);

    expect(await service.captureWeeklyRanks()).toBe(2);
  });

  it('does nothing on an empty board', async () => {
    playersService.getLeaderboard.mockResolvedValue([]);

    expect(await service.captureWeeklyRanks()).toBe(0);
    expect(playerRepository.update).not.toHaveBeenCalled();
  });

  it('reads the ranks the leaderboard computed', async () => {
    // Delegated rather than re-derived: recomputing the order here would
    // give two sources of truth that drift the first time a rule changes.
    playersService.getLeaderboard.mockResolvedValue([ranked('a', 1)]);

    await service.captureWeeklyRanks();

    expect(playersService.getLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('never writes a rating field', async () => {
    // A display concern must not touch the measurement.
    playersService.getLeaderboard.mockResolvedValue([ranked('a', 1)]);

    await service.captureWeeklyRanks();

    const [, patch] = writes()[0];
    expect(Object.keys(patch)).toEqual(['previousWeekRank']);
  });
});
