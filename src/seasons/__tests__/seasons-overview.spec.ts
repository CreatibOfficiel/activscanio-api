import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SeasonsService } from '../seasons.service';
import { SeasonArchive } from '../entities/season-archive.entity';
import { ArchivedCompetitorRanking } from '../entities/archived-competitor-ranking.entity';
import { ArchivedPingpongRanking } from '../entities/archived-pingpong-ranking.entity';
import { Competitor } from '../../competitors/competitor.entity';

/**
 * The archive overview.
 *
 * Every figure here is DERIVED at read time from the archived standings
 * rather than stored, which is what makes it available for the six seasons
 * already closed in production. The tests are written against the shape that
 * data actually has, including the two traps it contains:
 *
 *  - Postgres returns numerics as strings through the driver, so a row's
 *    `totalRaces` arrives as "34" and comparing it raw sorts lexically.
 *  - Competitors who sat a season out are archived anyway with an unchanged
 *    rating, landing on a delta of exactly 0. Counting them as "stable"
 *    would bury the real movements under people who never played.
 */
describe('SeasonsService — overview', () => {
  let service: SeasonsService;

  const query = jest.fn();

  const seasonArchiveRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { connection: { createQueryRunner: jest.fn() } },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(SeasonArchive),
          useValue: seasonArchiveRepository,
        },
        {
          provide: getRepositoryToken(ArchivedCompetitorRanking),
          useValue: { query, find: jest.fn() },
        },
        {
          provide: getRepositoryToken(ArchivedPingpongRanking),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SeasonsService>(SeasonsService);
  });

  /** A season archive, in the shape `getAllSeasons` returns. */
  function season(
    over: Partial<SeasonArchive> & { id: string },
  ): SeasonArchive {
    return {
      seasonNumber: 1,
      year: 2026,
      seasonName: 'Saison 1 - 2026',
      totalCompetitors: 12,
      totalRaces: 100,
      ...over,
    } as SeasonArchive;
  }

  /** A raw standing, with numerics as the strings the driver hands back. */
  function standing(over: Record<string, unknown>) {
    return {
      seasonId: 's1',
      seasonNumber: '1',
      competitorName: 'Someone',
      rank: null,
      finalRating: '1500',
      totalRaces: '10',
      eloDelta: null,
      ...over,
    };
  }

  it('returns empty figures when nothing has been archived', async () => {
    seasonArchiveRepository.find.mockResolvedValue([]);

    const result = await service.getSeasonsOverview();

    expect(result.seasons).toEqual([]);
    expect(result.overview.seasonCount).toBe(0);
    expect(result.overview.mostTitles).toBeNull();
    // No query is worth running against an empty archive.
    expect(query).not.toHaveBeenCalled();
  });

  it('picks the rank-1 competitor as the season winner', async () => {
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({
        competitorName: 'Don Joran',
        rank: 1,
        finalRating: '1729.4',
        totalRaces: '34',
      }),
      standing({
        competitorName: 'Léo Mibord',
        rank: 2,
        finalRating: '1657',
        totalRaces: '34',
      }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].winner).toEqual({ name: 'Don Joran', rating: 1729 });
  });

  it('keeps every name when a superlative ties', async () => {
    // Production season 2: two players on 34 races. Breaking the tie by sort
    // order would state a result the season did not produce.
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({ competitorName: 'Don Joran', rank: 1, totalRaces: '34' }),
      standing({ competitorName: 'Léo Mibord', rank: 2, totalRaces: '34' }),
      standing({ competitorName: 'Autre', rank: 3, totalRaces: '12' }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].mostActive).toEqual({
      names: ['Don Joran', 'Léo Mibord'],
      value: 34,
    });
  });

  it('compares race counts numerically, not as strings', async () => {
    // "9" > "34" lexically. Without Number() the busiest player would be
    // whoever raced fewest, and the bug would look like a data problem.
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({ competitorName: 'Neuf', totalRaces: '9' }),
      standing({ competitorName: 'Trente-quatre', totalRaces: '34' }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].mostActive).toEqual({
      names: ['Trente-quatre'],
      value: 34,
    });
  });

  it('reports the biggest climb and drop among players who actually raced', async () => {
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({
        competitorName: 'Charles',
        totalRaces: '42',
        eloDelta: '415.2',
      }),
      standing({
        competitorName: 'Marie',
        totalRaces: '3',
        eloDelta: '-565.4',
      }),
      standing({ competitorName: 'Absent', totalRaces: '0', eloDelta: '0' }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].biggestClimb).toEqual({ names: ['Charles'], value: 415 });
    expect(seasons[0].biggestDrop).toEqual({ names: ['Marie'], value: -565 });
  });

  it('excludes competitors who sat the season out', async () => {
    // Archived with an unchanged rating, so their delta is a real 0 that
    // means "did not play" rather than "held steady".
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({ competitorName: 'Absent', totalRaces: '0', eloDelta: '0' }),
      standing({ competitorName: 'Joueur', totalRaces: '5', eloDelta: '-12' }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].mostActive?.names).toEqual(['Joueur']);
    expect(seasons[0].biggestDrop).toEqual({ names: ['Joueur'], value: -12 });
    expect(seasons[0].biggestClimb).toBeNull();
  });

  it('reports no ELO movement for the first archived season', async () => {
    // LAG has nothing to look back at, so the change is unknown — not zero.
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({
        competitorName: 'Don Joran',
        rank: 1,
        totalRaces: '62',
        eloDelta: null,
      }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].biggestClimb).toBeNull();
    expect(seasons[0].biggestDrop).toBeNull();
    // The rest of the card is still measurable.
    expect(seasons[0].mostActive).toEqual({ names: ['Don Joran'], value: 62 });
  });

  it('counts titles across seasons', async () => {
    seasonArchiveRepository.find.mockResolvedValue([
      season({ id: 's1', seasonNumber: 1 }),
      season({ id: 's2', seasonNumber: 2 }),
    ]);
    query.mockResolvedValue([
      standing({ seasonId: 's1', competitorName: 'Don Joran', rank: 1 }),
      standing({ seasonId: 's2', competitorName: 'Don Joran', rank: 1 }),
    ]);

    const { overview } = await service.getSeasonsOverview();

    expect(overview.mostTitles).toEqual({ names: ['Don Joran'], value: 2 });
  });

  it('averages ping-pong over the seasons that recorded it', async () => {
    // The sport arrived mid-life: seasons closed before it have no column at
    // all, and averaging over them would divide by a run where it did not
    // exist.
    seasonArchiveRepository.find.mockResolvedValue([
      season({ id: 's1', seasonNumber: 1, totalRaces: 100 }),
      season({
        id: 's2',
        seasonNumber: 2,
        totalRaces: 100,
        totalPingpongMatches: 26,
      }),
    ]);
    query.mockResolvedValue([standing({})]);

    const { overview } = await service.getSeasonsOverview();

    expect(overview.pingpongSeasonCount).toBe(1);
    expect(overview.totalPingpongMatches).toBe(26);
    expect(overview.avgPingpongMatchesPerSeason).toBe(26);
  });

  it('averages races over every season', async () => {
    seasonArchiveRepository.find.mockResolvedValue([
      season({ id: 's1', seasonNumber: 1, totalRaces: 111 }),
      season({ id: 's2', seasonNumber: 2, totalRaces: 55 }),
    ]);
    query.mockResolvedValue([standing({})]);

    const { overview } = await service.getSeasonsOverview();

    expect(overview.totalRaces).toBe(166);
    expect(overview.avgRacesPerSeason).toBe(83);
    expect(overview.busiestSeason).toEqual({
      seasonName: 'Saison 1 - 2026',
      totalRaces: 111,
    });
  });

  it('names the best climb ever and the season it happened in', async () => {
    seasonArchiveRepository.find.mockResolvedValue([
      season({ id: 's1', seasonNumber: 1, seasonName: 'Saison 1 - 2026' }),
      season({ id: 's6', seasonNumber: 6, seasonName: 'Saison 6 - 2026' }),
    ]);
    query.mockResolvedValue([
      standing({
        seasonId: 's1',
        competitorName: 'Emmeline',
        totalRaces: '2',
        eloDelta: '114',
      }),
      standing({
        seasonId: 's6',
        competitorName: 'Charles',
        totalRaces: '42',
        eloDelta: '415',
      }),
    ]);

    const { overview } = await service.getSeasonsOverview();

    expect(overview.bestClimbEver).toEqual({
      names: ['Charles'],
      value: 415,
      seasonName: 'Saison 6 - 2026',
    });
  });

  it('reports no best climb when nobody ever gained', async () => {
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({ competitorName: 'Perdant', totalRaces: '4', eloDelta: '-30' }),
    ]);

    const { overview } = await service.getSeasonsOverview();

    expect(overview.bestClimbEver).toBeNull();
  });
});
