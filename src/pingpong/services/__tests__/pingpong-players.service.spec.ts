/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayersService } from '../pingpong-players.service';
import { PingpongRatingService } from '../pingpong-rating.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { PingpongMatch } from '../../entities/pingpong-match.entity';
import { Competitor } from '../../../competitors/competitor.entity';

/**
 * The leaderboard.
 *
 * Two properties matter here, and they pull in opposite directions: everyone
 * must be visible, and only a settled rating may carry a rank. Getting the
 * first wrong makes a new player invisible to themselves; getting the second
 * wrong puts someone on top of the office off three lucky matches.
 */
describe('PingpongPlayersService — leaderboard', () => {
  let service: PingpongPlayersService;
  let playerRepository: Repository<PingpongPlayer>;

  const NOW = new Date('2026-03-15T12:00:00Z');
  const YESTERDAY = new Date('2026-03-14T12:00:00Z');

  function player(overrides: Partial<PingpongPlayer>): PingpongPlayer {
    return {
      id: 'p',
      competitorId: 'c',
      competitor: { firstName: 'Test', lastName: 'Player' },
      rating: 1500,
      rd: 60,
      vol: 0.06,
      matchCount: 20,
      weightedMatchCount: 20,
      wins: 10,
      losses: 10,
      setsWon: 25,
      setsLost: 25,
      currentStreak: 0,
      bestStreak: 3,
      distinctOpponents21d: 4,
      diversityScore21d: 0.9,
      isRankingEligible: true,
      lastMatchAt: YESTERDAY,
      ...overrides,
    } as PingpongPlayer;
  }

  async function withPlayers(players: PingpongPlayer[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongPlayersService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { find: jest.fn().mockResolvedValue(players) },
        },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: PingpongRatingService,
          useValue: {
            getDefaultRatings: jest.fn(),
            // The real formula: the ordering tests below turn on it, so a
            // stub returning a constant would make them prove nothing.
            calculateConservativeScore: (rating: number, rd: number) =>
              Math.max(0, rating - 2 * rd),
          },
        },
      ],
    }).compile();

    service = module.get(PingpongPlayersService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));
    return service.getLeaderboard(NOW);
  }

  it('returns every player, ranked or not', async () => {
    const board = await withPlayers([
      player({ id: 'settled', weightedMatchCount: 20 }),
      player({ id: 'calibrating', weightedMatchCount: 2, rd: 200 }),
    ]);

    expect(board).toHaveLength(2);
    expect(board.map((p) => p.id).sort()).toEqual(['calibrating', 'settled']);
  });

  it('ranks by conservative score, not raw rating', async () => {
    const board = await withPlayers([
      // Higher rating, but far less certain: 1800 - 2*140 = 1520.
      player({ id: 'volatile', rating: 1800, rd: 140 }),
      // Lower rating, settled: 1650 - 2*40 = 1570.
      player({ id: 'settled', rating: 1650, rd: 40 }),
    ]);

    const ranked = board.filter((p) => p.rank !== null);
    expect(ranked.map((p) => p.id)).toEqual(['settled', 'volatile']);
  });

  it('withholds a rank while the rating is still calibrating', async () => {
    const board = await withPlayers([
      player({ id: 'settled' }),
      player({ id: 'newcomer', weightedMatchCount: 3, rd: 250 }),
    ]);

    expect(board.find((p) => p.id === 'newcomer')!.rank).toBeNull();
    expect(board.find((p) => p.id === 'settled')!.rank).toBe(1);
  });

  it('ranks a player who plays only one opponent', async () => {
    // The case the old diversity gate excluded. Their rating is real; it is
    // simply anchored to one point in the field, which the deviation says.
    const board = await withPlayers([
      player({ id: 'loyal', distinctOpponents21d: 1, diversityScore21d: 0 }),
    ]);

    expect(board[0].rank).toBe(1);
    expect(board[0].distinctOpponents21d).toBe(1);
  });

  it('does not wait for the nightly cron to rank a freshly calibrated player', async () => {
    // isRankingEligible is refreshed by cron, so someone who won their eighth
    // match this afternoon still carries yesterday's `false`. Ranking off the
    // stored flag would leave them off the board until tomorrow.
    const board = await withPlayers([
      player({
        id: 'just-calibrated',
        weightedMatchCount: 10,
        rd: 90,
        isRankingEligible: false,
      }),
    ]);

    expect(board[0].rank).toBe(1);
  });

  it('leaves an inactive player unranked but visible', async () => {
    const board = await withPlayers([
      player({ id: 'active' }),
      player({ id: 'away', lastMatchAt: new Date('2026-01-01T12:00:00Z') }),
    ]);

    const away = board.find((p) => p.id === 'away')!;
    expect(away.rank).toBeNull();
    expect(away.inactive).toBe(true);
    expect(board.find((p) => p.id === 'active')!.rank).toBe(1);
  });

  it('numbers ranks consecutively, skipping the unranked', async () => {
    // An unranked player in the middle must not consume a number and push
    // the next one down.
    const board = await withPlayers([
      player({ id: 'first', rating: 1800, rd: 40 }),
      player({
        id: 'calibrating',
        rating: 1750,
        rd: 250,
        weightedMatchCount: 1,
      }),
      player({ id: 'second', rating: 1700, rd: 40 }),
    ]);

    expect(board.find((p) => p.id === 'first')!.rank).toBe(1);
    expect(board.find((p) => p.id === 'second')!.rank).toBe(2);
    expect(board.find((p) => p.id === 'calibrating')!.rank).toBeNull();
  });

  it('reads every player once', async () => {
    await withPlayers([player({})]);

    expect(playerRepository.find).toHaveBeenCalledTimes(1);
  });
});
