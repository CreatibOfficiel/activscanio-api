/**
 * Daily rank snapshot.
 *
 * The leaderboard shows "you moved up two places" against the rank a player
 * held at the start of the day. The cadence is daily because the movement
 * rule it feeds (see the front end's rank-movement) only shows an arrow to
 * someone who played inside a two-day window — the arrow claims a reason,
 * and the reason has to be a match the player actually played. A weekly
 * capture would let a Sunday match be compared against a rank frozen the
 * previous Monday, which is not a movement that player caused.
 *
 * The column is `previousDayRank`, the same name the Mario Kart leaderboard
 * uses, and the one the front end reads.
 */ /* eslint-disable @typescript-eslint/unbound-method */
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
  function writes(): [string, { previousDayRank: number | null }][] {
    return (playerRepository.update as jest.Mock).mock.calls as [
      string,
      { previousDayRank: number | null },
    ][];
  }

  it('stores the rank each player currently holds', async () => {
    playersService.getLeaderboard.mockResolvedValue([
      ranked('a', 1),
      ranked('b', 2),
    ]);

    await service.captureDailyRanks();

    expect(writes()).toEqual([
      ['a', { previousDayRank: 1 }],
      ['b', { previousDayRank: 2 }],
    ]);
  });

  it('stores null for a player who carries no rank', async () => {
    // Someone still calibrating has no position to move from. Storing 0 or
    // omitting them would make their first ranked week look like a jump
    // from the bottom of the table.
    playersService.getLeaderboard.mockResolvedValue([ranked('new', null)]);

    await service.captureDailyRanks();

    expect(writes()).toEqual([['new', { previousDayRank: null }]]);
  });

  it('reports how many players it captured', async () => {
    playersService.getLeaderboard.mockResolvedValue([
      ranked('a', 1),
      ranked('b', null),
    ]);

    expect(await service.captureDailyRanks()).toBe(2);
  });

  it('does nothing on an empty board', async () => {
    playersService.getLeaderboard.mockResolvedValue([]);

    expect(await service.captureDailyRanks()).toBe(0);
    expect(playerRepository.update).not.toHaveBeenCalled();
  });

  it('reads the ranks the leaderboard computed', async () => {
    // Delegated rather than re-derived: recomputing the order here would
    // give two sources of truth that drift the first time a rule changes.
    playersService.getLeaderboard.mockResolvedValue([ranked('a', 1)]);

    await service.captureDailyRanks();

    expect(playersService.getLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('never writes a rating field', async () => {
    // A display concern must not touch the measurement.
    playersService.getLeaderboard.mockResolvedValue([ranked('a', 1)]);

    await service.captureDailyRanks();

    const [, patch] = writes()[0];
    expect(Object.keys(patch)).toEqual(['previousDayRank']);
  });
});
