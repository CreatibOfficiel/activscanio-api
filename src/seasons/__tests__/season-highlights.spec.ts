/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SeasonsService } from '../seasons.service';
import { SeasonArchive } from '../entities/season-archive.entity';
import { ArchivedCompetitorRanking } from '../entities/archived-competitor-ranking.entity';
import { ArchivedPingpongRanking } from '../entities/archived-pingpong-ranking.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { RaceEvent } from '../../races/race-event.entity';

/**
 * Season highlights that must survive the betting removal.
 *
 * Five of the eight highlights are betting-derived (perfect scores, perfect
 * podiums, highest bet score, biggest upset, longest participation streak).
 * The three pinned here read only archived_competitor_rankings, races,
 * race_results and competitors — no betting table involved — so they have to
 * keep working untouched.
 */
describe('SeasonsService — surviving highlights', () => {
  let service: SeasonsService;
  let archivedRankingRepository: Repository<ArchivedCompetitorRanking>;
  let seasonArchiveRepository: Repository<SeasonArchive>;

  const SEASON = {
    id: 'archive-1',
    seasonNumber: 3,
    year: 2026,
    startDate: new Date('2026-04-06'),
    endDate: new Date('2026-05-03'),
  } as SeasonArchive;

  /** Query builder stub whose getRawOne/getRawMany can be scripted per call. */
  function queryBuilder(rawOne: unknown = null, rawMany: unknown[] = []) {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'leftJoin',
      'innerJoinAndSelect',
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orWhere',
      'groupBy',
      'addGroupBy',
      'having',
      'andHaving',
      'orderBy',
      'addOrderBy',
      'limit',
      'offset',
      'take',
      'skip',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getRawOne = jest.fn().mockResolvedValue(rawOne);
    qb.getRawMany = jest.fn().mockResolvedValue(rawMany);
    return qb;
  }

  /** Query builder that yields nothing, for the betting highlights. */
  function emptyQb() {
    return queryBuilder(null, []);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        {
          provide: getRepositoryToken(SeasonArchive),
          useValue: {
            findOne: jest.fn().mockResolvedValue(SEASON),
            manager: { createQueryBuilder: jest.fn() },
          },
        },
        {
          provide: getRepositoryToken(ArchivedCompetitorRanking),
          useValue: { createQueryBuilder: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(ArchivedPingpongRanking),
          useValue: { find: jest.fn() },
        },
        { provide: getRepositoryToken(Competitor), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(RaceEvent), useValue: { count: jest.fn() } },
        // Betting repositories still injected by SeasonsService. They go away
        // when the betting highlights are cut; these stubs go with them.
      ],
    }).compile();

    service = module.get(SeasonsService);
    archivedRankingRepository = module.get(
      getRepositoryToken(ArchivedCompetitorRanking),
    );
    seasonArchiveRepository = module.get(getRepositoryToken(SeasonArchive));
  });

  it('reports the longest win streak of the season', async () => {
    jest
      .spyOn(archivedRankingRepository, 'createQueryBuilder')
      .mockReturnValueOnce(
        queryBuilder({ competitorName: 'Alice Adams', streak: '7' }) as never,
      )
      .mockReturnValueOnce(queryBuilder(null) as never);
    jest
      .spyOn(seasonArchiveRepository.manager, 'createQueryBuilder')
      .mockReturnValue(queryBuilder(null, []) as never);

    const highlights = await service.getSeasonHighlights(3, 2026);

    expect(highlights.longestWinStreak).toEqual({
      competitorName: 'Alice Adams',
      streak: 7,
    });
  });

  it('omits the win streak when nobody strung one together', async () => {
    jest
      .spyOn(archivedRankingRepository, 'createQueryBuilder')
      .mockReturnValueOnce(
        queryBuilder({ competitorName: 'Alice Adams', streak: '0' }) as never,
      )
      .mockReturnValueOnce(queryBuilder(null) as never);
    jest
      .spyOn(seasonArchiveRepository.manager, 'createQueryBuilder')
      .mockReturnValue(queryBuilder(null, []) as never);

    const highlights = await service.getSeasonHighlights(3, 2026);

    expect(highlights.longestWinStreak).toBeNull();
  });

  it('reports the competitor with the most races', async () => {
    jest
      .spyOn(archivedRankingRepository, 'createQueryBuilder')
      .mockReturnValueOnce(queryBuilder(null) as never)
      .mockReturnValueOnce(
        queryBuilder({ competitorName: 'Bob Blake', count: '24' }) as never,
      );
    jest
      .spyOn(seasonArchiveRepository.manager, 'createQueryBuilder')
      .mockReturnValue(queryBuilder(null, []) as never);

    const highlights = await service.getSeasonHighlights(3, 2026);

    expect(highlights.mostRaces).toEqual({
      competitorName: 'Bob Blake',
      count: 24,
    });
  });

  it('lists the drivers who scored a perfect race', async () => {
    jest
      .spyOn(archivedRankingRepository, 'createQueryBuilder')
      .mockReturnValue(queryBuilder(null) as never);
    jest
      .spyOn(seasonArchiveRepository.manager, 'createQueryBuilder')
      .mockReturnValue(
        queryBuilder(null, [
          { competitorName: 'Carla Cruz', maxScore: '60', perfectCount: '3' },
          { competitorName: 'Dan Doe', maxScore: '60', perfectCount: '1' },
        ]) as never,
      );

    const highlights = await service.getSeasonHighlights(3, 2026);

    expect(highlights.bestRaceScorers).toEqual([
      { competitorName: 'Carla Cruz', maxScore: 60, perfectCount: 3 },
      { competitorName: 'Dan Doe', maxScore: 60, perfectCount: 1 },
    ]);
  });

  it('returns nulls for every highlight when the season has no data', async () => {
    jest
      .spyOn(archivedRankingRepository, 'createQueryBuilder')
      .mockReturnValue(queryBuilder(null) as never);
    jest
      .spyOn(seasonArchiveRepository.manager, 'createQueryBuilder')
      .mockReturnValue(queryBuilder(null, []) as never);

    const highlights = await service.getSeasonHighlights(3, 2026);

    expect(highlights.longestWinStreak).toBeNull();
    expect(highlights.mostRaces).toBeNull();
    expect(highlights.bestRaceScorers).toBeNull();
  });
});
