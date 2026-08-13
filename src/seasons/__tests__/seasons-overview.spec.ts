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
  const count = jest.fn();
  const competitorFind = jest.fn();

  const seasonArchiveRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { connection: { createQueryRunner: jest.fn() }, count },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: the running season is already archived, so `getCurrentSeason`
    // bows out and the tests below see archives only. The live-season block
    // overrides this.
    seasonArchiveRepository.findOne.mockResolvedValue({ id: 'already' });
    competitorFind.mockResolvedValue([]);
    count.mockResolvedValue(0);

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
          useValue: { find: competitorFind },
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
      finalRd: '50',
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
        finalRd: '50.7',
        totalRaces: '34',
      }),
      standing({
        competitorName: 'Léo Mibord',
        rank: 2,
        finalRating: '1657',
        finalRd: '51',
        totalRaces: '34',
      }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    // The CONSERVATIVE score, 1729.4 − 2×50.7, not the raw rating. Every
    // other board in the app shows this one, so a card showing 1729 would
    // report a number that player never carried on the leaderboard.
    expect(seasons[0].winner).toEqual({ name: 'Don Joran', rating: 1628 });
  });

  it('shows the same score the leaderboard shows, not the raw rating', async () => {
    // A wide RD is exactly where the two numbers diverge, and it is the
    // case that made the bug visible: the card printed a rating nobody had
    // ever seen next to that player's name.
    seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
    query.mockResolvedValue([
      standing({
        competitorName: 'Incertain',
        rank: 1,
        finalRating: '1800',
        finalRd: '140',
      }),
    ]);

    const { seasons } = await service.getSeasonsOverview();

    expect(seasons[0].winner?.rating).toBe(1520);
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

  describe('the season in progress', () => {
    /** A live competitor row, as `competitors` holds it mid-season. */
    function competitor(over: Record<string, unknown>) {
      return {
        firstName: 'Yann',
        lastName: 'Ó hAnnaidh',
        rating: 1700,
        rd: 54,
        raceCount: 40,
        currentMonthRaceCount: 12,
        ...over,
      };
    }

    beforeEach(() => {
      // Nothing archived for the running season yet.
      seasonArchiveRepository.findOne.mockResolvedValue(null);
    });

    it('prepends the running season, badged as in progress', async () => {
      seasonArchiveRepository.find.mockResolvedValue([
        season({ id: 's1', seasonNumber: 1 }),
      ]);
      query.mockResolvedValue([standing({})]);
      competitorFind.mockResolvedValue([competitor({})]);

      const { seasons } = await service.getSeasonsOverview();

      expect(seasons).toHaveLength(2);
      expect(seasons[0].inProgress).toBe(true);
      // Newest first, and the running one is the newest there is.
      expect(seasons[1].inProgress).toBeUndefined();
    });

    it('names the live leader by conservative score', async () => {
      seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
      query.mockResolvedValue([standing({})]);
      competitorFind.mockResolvedValue([
        // Higher raw rating, but a wide RD puts them behind on rating − 2×RD.
        competitor({
          firstName: 'Gros',
          lastName: 'RD',
          rating: 1750,
          rd: 140,
        }),
        competitor({ firstName: 'Yann', lastName: 'Ó', rating: 1700, rd: 54 }),
      ]);

      const { seasons } = await service.getSeasonsOverview();

      // 1700 − 2×54. Ranked on the conservative score, so displayed on it
      // too: sorting by one number and printing another is how the raw
      // rating leaked onto the card in the first place.
      expect(seasons[0].winner).toEqual({ name: 'Yann Ó', rating: 1592 });
    });

    it('excludes provisional players from the live lead', async () => {
      // Same rule the archives apply: a rating with a wide RD is not a
      // standing, so it cannot be a lead.
      seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
      query.mockResolvedValue([standing({})]);
      competitorFind.mockResolvedValue([
        competitor({ firstName: 'Neuf', raceCount: 2, rating: 1900, rd: 300 }),
      ]);

      const { seasons } = await service.getSeasonsOverview();

      expect(seasons[0].winner).toBeNull();
    });

    it('ranks live activity on the per-season counter', async () => {
      // `currentMonthRaceCount` resets each transition; `raceCount` is the
      // lifetime total and would just rank the veterans.
      seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
      query.mockResolvedValue([standing({})]);
      competitorFind.mockResolvedValue([
        competitor({
          firstName: 'Vétéran',
          raceCount: 900,
          currentMonthRaceCount: 3,
        }),
        competitor({
          firstName: 'Assidu',
          raceCount: 20,
          currentMonthRaceCount: 50,
        }),
      ]);

      const { seasons } = await service.getSeasonsOverview();

      expect(seasons[0].mostActive?.names).toEqual(['Assidu Ó hAnnaidh']);
      expect(seasons[0].mostActive?.value).toBe(50);
    });

    it('reports no ELO movement while the season runs', async () => {
      seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
      query.mockResolvedValue([standing({})]);
      competitorFind.mockResolvedValue([competitor({})]);

      const { seasons } = await service.getSeasonsOverview();

      expect(seasons[0].biggestClimb).toBeNull();
      expect(seasons[0].biggestDrop).toBeNull();
    });

    it('keeps the running season out of every aggregate', async () => {
      // This is the whole reason it is prepended rather than folded in. Its
      // leader is not a champion, and its part-played race count would drag
      // the per-season average down for the whole month.
      seasonArchiveRepository.find.mockResolvedValue([
        season({ id: 's1', seasonNumber: 1, totalRaces: 100 }),
      ]);
      query.mockResolvedValue([
        standing({ competitorName: 'Don Joran', rank: 1 }),
      ]);
      competitorFind.mockResolvedValue([competitor({ firstName: 'Yann' })]);
      count.mockResolvedValue(5);

      const { overview } = await service.getSeasonsOverview();

      expect(overview.seasonCount).toBe(1);
      expect(overview.totalRaces).toBe(100);
      expect(overview.avgRacesPerSeason).toBe(100);
      expect(overview.mostTitles).toEqual({ names: ['Don Joran'], value: 1 });
    });

    it('shows the running season even with nothing archived yet', async () => {
      seasonArchiveRepository.find.mockResolvedValue([]);
      competitorFind.mockResolvedValue([competitor({})]);

      const { seasons, overview } = await service.getSeasonsOverview();

      expect(seasons).toHaveLength(1);
      expect(seasons[0].inProgress).toBe(true);
      expect(overview.seasonCount).toBe(0);
    });

    it('omits it once the season has been archived', async () => {
      // The cron has run: the card exists as an archive and adding a live
      // one would show the same season twice.
      seasonArchiveRepository.findOne.mockResolvedValue({ id: 'archived' });
      seasonArchiveRepository.find.mockResolvedValue([season({ id: 's1' })]);
      query.mockResolvedValue([standing({})]);

      const { seasons } = await service.getSeasonsOverview();

      expect(seasons).toHaveLength(1);
      expect(seasons[0].inProgress).toBeUndefined();
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
