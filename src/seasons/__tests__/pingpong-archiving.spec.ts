/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SeasonsService } from '../seasons.service';
import { SeasonArchive } from '../entities/season-archive.entity';
import { ArchivedCompetitorRanking } from '../entities/archived-competitor-ranking.entity';
import { ArchivedPingpongRanking } from '../entities/archived-pingpong-ranking.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { PingpongPlayer } from '../../pingpong/entities/pingpong-player.entity';
import { PingpongMatch } from '../../pingpong/entities/pingpong-match.entity';
import { SeasonUtils } from '../../common/utils/season-utils';
import { WeekUtils } from '../../common/utils/week-utils';

/**
 * Ping-pong season archiving.
 *
 * This is the one place where ping-pong reaches into production Mario Kart
 * code, so the tests are written around a single question: can archiving
 * ping-pong break archiving races? Both must go into the SAME transaction —
 * a season half-archived is worse than one not archived at all, because the
 * cron will not run again and the missing half is silently gone.
 */
describe('SeasonsService — ping-pong archiving', () => {
  let service: SeasonsService;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn((v: unknown) => v),
      update: jest.fn(),
    },
  };

  /** Everything saved to a given archive table, flattened across batches. */
  function savedRows(entity: unknown): Record<string, unknown>[] {
    const created = mockQueryRunner.manager.create.mock.calls
      .filter(([e]) => e === entity)
      .map(([, data]) => data as Record<string, unknown>);
    return created;
  }

  // The competitor archive marks anyone whose last race predates the season
  // end by more than 8 days as inactive, so this has to sit inside the
  // window that SeasonUtils computes rather than at a hardcoded date.
  const seasonWeeks = SeasonUtils.getSeasonWeeks(1);
  const seasonEnd = WeekUtils.getSundayOfWeek(2024, seasonWeeks.end);
  const lastActivity = new Date(seasonEnd.getTime() - 24 * 60 * 60 * 1000);

  const competitors: Partial<Competitor>[] = [
    {
      id: 'c1',
      firstName: 'Mario',
      lastName: 'Bros',
      rating: 1600,
      rd: 50,
      vol: 0.06,
      raceCount: 10,
      winStreak: 3,
      avgRank12: 2.5,
      currentMonthRaceCount: 5,
      lastRaceDate: lastActivity,
    },
  ];

  function player(overrides: Partial<PingpongPlayer>): Partial<PingpongPlayer> {
    return {
      id: 'p1',
      competitorId: 'c1',
      rating: 1600,
      rd: 60,
      vol: 0.06,
      matchCount: 20,
      weightedMatchCount: 20,
      wins: 12,
      losses: 8,
      setsWon: 30,
      setsLost: 25,
      currentStreak: 2,
      bestStreak: 5,
      distinctOpponents21d: 6,
      diversityScore21d: 0.8,
      isRankingEligible: true,
      lastMatchAt: lastActivity,
      ...overrides,
    };
  }

  async function buildService() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(SeasonArchive),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            manager: {
              connection: {
                createQueryRunner: jest.fn(() => mockQueryRunner),
              },
            },
          },
        },
        {
          provide: getRepositoryToken(ArchivedCompetitorRanking),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(ArchivedPingpongRanking),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get(SeasonsService);
  }

  /**
   * Wire the transaction manager for one archiveSeason call.
   *
   * `find` is called for competitors first, then ping-pong players; `count`
   * for races, then ping-pong matches.
   */
  function givenSeason(options: {
    players: Partial<PingpongPlayer>[];
    races?: number;
    matches?: number;
  }) {
    mockQueryRunner.manager.find
      .mockResolvedValueOnce(competitors)
      .mockResolvedValueOnce(options.players);
    mockQueryRunner.manager.count
      .mockResolvedValueOnce(options.races ?? 10)
      .mockResolvedValueOnce(options.matches ?? 40);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryRunner.manager.create.mockImplementation(
      (_entity: unknown, data: unknown) => data,
    );
    mockQueryRunner.manager.save.mockImplementation((v: unknown) => v);
    await buildService();
  });

  it('archives ping-pong players alongside competitors in one transaction', async () => {
    givenSeason({ players: [player({})] });

    await service.archiveSeason(1, 2024);

    expect(savedRows(ArchivedPingpongRanking)).toHaveLength(1);
    expect(savedRows(ArchivedCompetitorRanking)).toHaveLength(1);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('ranks eligible players by conservative score', async () => {
    givenSeason({
      players: [
        player({ id: 'p1', rating: 1500, rd: 50 }), // 1400
        player({ id: 'p2', rating: 1700, rd: 50 }), // 1600
        player({ id: 'p3', rating: 1600, rd: 50 }), // 1500
      ],
    });

    await service.archiveSeason(1, 2024);

    const ranked = savedRows(ArchivedPingpongRanking)
      .filter((r) => r.rank !== null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));

    expect(ranked.map((r) => r.playerId)).toEqual(['p2', 'p3', 'p1']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied players the same rank', async () => {
    givenSeason({
      players: [
        player({ id: 'p1', rating: 1600, rd: 50 }),
        player({ id: 'p2', rating: 1600, rd: 50 }),
        player({ id: 'p3', rating: 1500, rd: 50 }),
      ],
    });

    await service.archiveSeason(1, 2024);

    const ranks = savedRows(ArchivedPingpongRanking).map((r) => r.rank);
    // Two firsts, then third — the same convention as the race archive.
    expect(ranks.filter((r) => r === 1)).toHaveLength(2);
    expect(ranks).toContain(3);
    expect(ranks).not.toContain(2);
  });

  it('archives ineligible players with a null rank rather than dropping them', async () => {
    // Losing them would make the archive lie about who was around that season.
    givenSeason({
      players: [
        player({ id: 'p1', isRankingEligible: true }),
        player({ id: 'p2', isRankingEligible: false, matchCount: 3 }),
      ],
    });

    await service.archiveSeason(1, 2024);

    const rows = savedRows(ArchivedPingpongRanking);
    expect(rows).toHaveLength(2);

    const provisional = rows.find((r) => r.playerId === 'p2')!;
    expect(provisional.rank).toBeNull();
    expect(provisional.provisional).toBe(true);
    // Their rating is still worth keeping — it just carries no rank.
    expect(provisional.finalRating).toBe(1600);
  });

  it('keeps ineligible players out of the ranking sequence', async () => {
    // An unranked player must not consume rank 2 and push the next one to 3.
    givenSeason({
      players: [
        player({ id: 'p1', rating: 1700, rd: 50, isRankingEligible: true }),
        player({ id: 'p2', rating: 1650, rd: 50, isRankingEligible: false }),
        player({ id: 'p3', rating: 1600, rd: 50, isRankingEligible: true }),
      ],
    });

    await service.archiveSeason(1, 2024);

    const rows = savedRows(ArchivedPingpongRanking);
    expect(rows.find((r) => r.playerId === 'p1')!.rank).toBe(1);
    expect(rows.find((r) => r.playerId === 'p3')!.rank).toBe(2);
    expect(rows.find((r) => r.playerId === 'p2')!.rank).toBeNull();
  });

  it('carries the per-sport stats into the archive', async () => {
    givenSeason({
      players: [
        player({
          wins: 14,
          losses: 6,
          setsWon: 31,
          setsLost: 19,
          bestStreak: 7,
          matchCount: 20,
        }),
      ],
    });

    await service.archiveSeason(1, 2024);

    expect(savedRows(ArchivedPingpongRanking)[0]).toMatchObject({
      wins: 14,
      losses: 6,
      setsWon: 31,
      setsLost: 19,
      bestStreak: 7,
      totalMatches: 20,
    });
  });

  it('counts ping-pong players and matches on the archive', async () => {
    givenSeason({
      players: [player({ id: 'p1' }), player({ id: 'p2' })],
      matches: 57,
    });

    await service.archiveSeason(1, 2024);

    expect(savedRows(SeasonArchive)[0]).toMatchObject({
      totalPingpongPlayers: 2,
      totalPingpongMatches: 57,
    });
  });

  it('still archives a season with no ping-pong players at all', async () => {
    // The likely state of the first season after this ships.
    givenSeason({ players: [], matches: 0 });

    const archive = await service.archiveSeason(1, 2024);

    expect(archive).toBeDefined();
    expect(savedRows(ArchivedPingpongRanking)).toHaveLength(0);
    expect(savedRows(ArchivedCompetitorRanking)).toHaveLength(1);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rolls the whole season back when ping-pong archiving fails', async () => {
    // Half a season archived is worse than none: the cron will not run again
    // and the missing half is gone silently.
    givenSeason({ players: [player({})] });
    mockQueryRunner.manager.save.mockImplementation((value: unknown) => {
      const row = Array.isArray(value) ? value[0] : value;
      if (row && (row as Record<string, unknown>).playerId) {
        throw new Error('ping-pong archive write failed');
      }
      return value;
    });

    await expect(service.archiveSeason(1, 2024)).rejects.toThrow(
      'ping-pong archive write failed',
    );

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('does not disturb the competitor archive rows', async () => {
    // The guarantee that matters most: Mario Kart archiving is unchanged.
    givenSeason({ players: [player({})] });

    await service.archiveSeason(1, 2024);

    expect(savedRows(ArchivedCompetitorRanking)[0]).toMatchObject({
      competitorId: 'c1',
      competitorName: 'Mario Bros',
      rank: 1,
      provisional: false,
      finalRating: 1600,
      totalRaces: 5,
      winStreak: 3,
      avgRank12: 2.5,
    });
  });

  it('reads ping-pong matches within the season window only', async () => {
    givenSeason({ players: [player({})] });

    await service.archiveSeason(1, 2024);

    const matchCountCall = mockQueryRunner.manager.count.mock.calls.find(
      ([entity]) => entity === PingpongMatch,
    );
    expect(matchCountCall).toBeDefined();
    // Counting the whole table would report every match ever played as if it
    // belonged to this season.
    expect(matchCountCall![1]).toHaveProperty('where.playedAt');
  });
});
