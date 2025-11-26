import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { SeasonsService } from './seasons.service';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';

describe('SeasonsService', () => {
  let service: SeasonsService;
  let seasonArchiveRepository: Repository<SeasonArchive>;
  let archivedCompetitorRankingRepository: Repository<ArchivedCompetitorRanking>;
  let competitorRepository: Repository<Competitor>;
  let bettingWeekRepository: Repository<BettingWeek>;
  let betRepository: Repository<Bet>;
  let bettorRankingRepository: Repository<BettorRanking>;
  let queryRunner: QueryRunner;

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
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      connection: {
        createQueryRunner: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
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
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BettingWeek),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Bet),
          useValue: {
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BettorRanking),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SeasonsService>(SeasonsService);
    seasonArchiveRepository = module.get<Repository<SeasonArchive>>(
      getRepositoryToken(SeasonArchive),
    );
    archivedCompetitorRankingRepository = module.get<
      Repository<ArchivedCompetitorRanking>
    >(getRepositoryToken(ArchivedCompetitorRanking));
    competitorRepository = module.get<Repository<Competitor>>(
      getRepositoryToken(Competitor),
    );
    bettingWeekRepository = module.get<Repository<BettingWeek>>(
      getRepositoryToken(BettingWeek),
    );
    betRepository = module.get<Repository<Bet>>(getRepositoryToken(Bet));
    bettorRankingRepository = module.get<Repository<BettorRanking>>(
      getRepositoryToken(BettorRanking),
    );
    queryRunner = mockQueryRunner as unknown as QueryRunner;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('archiveSeason', () => {
    const month = 1;
    const year = 2024;

    const mockCompetitors: Partial<Competitor>[] = [
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
      },
      {
        id: 'c2',
        firstName: 'Luigi',
        lastName: 'Bros',
        rating: 1550,
        rd: 60,
        vol: 0.06,
        raceCount: 8,
        winStreak: 1,
        avgRank12: 3.2,
      },
    ];

    const mockBettingWeeks: Partial<BettingWeek>[] = [
      { id: 'w1', month, year, weekNumber: 1 },
      { id: 'w2', month, year, weekNumber: 2 },
    ];

    beforeEach(() => {
      mockQueryRunner.connect.mockResolvedValue(undefined);
      mockQueryRunner.startTransaction.mockResolvedValue(undefined);
      mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
      mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
      mockQueryRunner.release.mockResolvedValue(undefined);
    });

    it('should archive season successfully', async () => {
      mockQueryRunner.manager.find
        .mockResolvedValueOnce(mockCompetitors) // Find competitors
        .mockResolvedValueOnce(mockBettingWeeks); // Find betting weeks

      mockQueryRunner.manager.count
        .mockResolvedValueOnce(15) // Bets count
        .mockResolvedValueOnce(5); // Bettor rankings count

      const mockArchive = {
        id: 'archive-1',
        month,
        year,
        seasonName: 'January 2024',
        totalCompetitors: 2,
        totalBettors: 5,
        totalRaces: 0,
        totalBets: 15,
      };

      mockQueryRunner.manager.create.mockImplementation((entity, data) => {
        if (entity === SeasonArchive) {
          return mockArchive;
        }
        return data;
      });

      mockQueryRunner.manager.save.mockResolvedValue(mockArchive);

      const result = await service.archiveSeason(month, year);

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        SeasonArchive,
        expect.objectContaining({
          month,
          year,
          seasonName: 'January 2024',
          totalCompetitors: 2,
        }),
      );
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        BettingWeek,
        { month, year },
        { seasonArchiveId: mockArchive.id },
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(result).toEqual(mockArchive);
    });

    it('should archive competitor rankings in batches', async () => {
      // Create 150 competitors to test batch processing
      const manyCompetitors = Array.from({ length: 150 }, (_, i) => ({
        id: `c${i}`,
        firstName: `Competitor`,
        lastName: `${i}`,
        rating: 1500 + i,
        rd: 50,
        vol: 0.06,
        raceCount: 5,
        winStreak: 0,
        avgRank12: 5.0,
      }));

      mockQueryRunner.manager.find
        .mockResolvedValueOnce(manyCompetitors)
        .mockResolvedValueOnce([]);

      mockQueryRunner.manager.count.mockResolvedValue(0);

      mockQueryRunner.manager.create.mockImplementation((entity, data) => {
        if (entity === SeasonArchive) {
          return { id: 'archive-1', month, year, seasonName: 'January 2024' };
        }
        return data;
      });

      mockQueryRunner.manager.save.mockResolvedValue({ id: 'archive-1' });

      await service.archiveSeason(month, year);

      // Should save rankings in 2 batches (100 + 50)
      const saveCalls = mockQueryRunner.manager.save.mock.calls;
      expect(saveCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should rollback transaction on error', async () => {
      mockQueryRunner.manager.find.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.archiveSeason(month, year)).rejects.toThrow(
        'Database error',
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should handle empty competitors list', async () => {
      mockQueryRunner.manager.find
        .mockResolvedValueOnce([]) // No competitors
        .mockResolvedValueOnce([]);

      mockQueryRunner.manager.count.mockResolvedValue(0);

      const mockArchive = {
        id: 'archive-1',
        month,
        year,
        seasonName: 'January 2024',
        totalCompetitors: 0,
        totalBettors: 0,
        totalRaces: 0,
        totalBets: 0,
      };

      mockQueryRunner.manager.create.mockReturnValue(mockArchive);
      mockQueryRunner.manager.save.mockResolvedValue(mockArchive);

      const result = await service.archiveSeason(month, year);

      expect(result.totalCompetitors).toBe(0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should calculate correct date range', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([]);
      mockQueryRunner.manager.count.mockResolvedValue(0);

      mockQueryRunner.manager.create.mockImplementation((entity, data) => {
        if (entity === SeasonArchive) {
          // Verify date range
          expect(data.startDate).toEqual(new Date(2024, 0, 1)); // Jan 1
          expect(data.endDate).toEqual(
            new Date(2024, 1, 0, 23, 59, 59, 999),
          ); // Jan 31 end
          return data;
        }
        return data;
      });

      mockQueryRunner.manager.save.mockResolvedValue({ id: 'archive-1' });

      await service.archiveSeason(month, year);

      expect(mockQueryRunner.manager.create).toHaveBeenCalled();
    });
  });

  describe('getAllSeasons', () => {
    it('should return all seasons ordered by year and month DESC', async () => {
      const mockSeasons: Partial<SeasonArchive>[] = [
        { id: '1', month: 12, year: 2024, seasonName: 'December 2024' },
        { id: '2', month: 11, year: 2024, seasonName: 'November 2024' },
        { id: '3', month: 10, year: 2024, seasonName: 'October 2024' },
      ];

      jest
        .spyOn(seasonArchiveRepository, 'find')
        .mockResolvedValue(mockSeasons as SeasonArchive[]);

      const result = await service.getAllSeasons();

      expect(seasonArchiveRepository.find).toHaveBeenCalledWith({
        order: { year: 'DESC', month: 'DESC' },
      });
      expect(result).toEqual(mockSeasons);
    });

    it('should return empty array when no seasons exist', async () => {
      jest.spyOn(seasonArchiveRepository, 'find').mockResolvedValue([]);

      const result = await service.getAllSeasons();

      expect(result).toEqual([]);
    });
  });

  describe('getSeason', () => {
    it('should return season with relations', async () => {
      const mockSeason: Partial<SeasonArchive> = {
        id: '1',
        month: 1,
        year: 2024,
        seasonName: 'January 2024',
        competitorRankings: [],
      };

      jest
        .spyOn(seasonArchiveRepository, 'findOne')
        .mockResolvedValue(mockSeason as SeasonArchive);

      const result = await service.getSeason(1, 2024);

      expect(seasonArchiveRepository.findOne).toHaveBeenCalledWith({
        where: { month: 1, year: 2024 },
        relations: ['competitorRankings'],
      });
      expect(result).toEqual(mockSeason);
    });

    it('should return null when season not found', async () => {
      jest.spyOn(seasonArchiveRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getSeason(13, 2024);

      expect(result).toBeNull();
    });
  });

  describe('getCompetitorRankings', () => {
    it('should return rankings ordered by rank ASC', async () => {
      const seasonId = 'season-1';
      const mockRankings: Partial<ArchivedCompetitorRanking>[] = [
        { id: 'r1', rank: 1, competitorName: 'Mario Bros' },
        { id: 'r2', rank: 2, competitorName: 'Luigi Bros' },
      ];

      jest
        .spyOn(archivedCompetitorRankingRepository, 'find')
        .mockResolvedValue(mockRankings as ArchivedCompetitorRanking[]);

      const result = await service.getCompetitorRankings(seasonId);

      expect(archivedCompetitorRankingRepository.find).toHaveBeenCalledWith({
        where: { seasonArchiveId: seasonId },
        order: { rank: 'ASC' },
      });
      expect(result).toEqual(mockRankings);
    });

    it('should return empty array when no rankings found', async () => {
      jest
        .spyOn(archivedCompetitorRankingRepository, 'find')
        .mockResolvedValue([]);

      const result = await service.getCompetitorRankings('non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('getBettorRankings', () => {
    it('should return bettor rankings with user relations', async () => {
      const mockRankings: Partial<BettorRanking>[] = [
        { id: 'b1', rank: 1, month: 1, year: 2024 },
        { id: 'b2', rank: 2, month: 1, year: 2024 },
      ];

      jest
        .spyOn(bettorRankingRepository, 'find')
        .mockResolvedValue(mockRankings as BettorRanking[]);

      const result = await service.getBettorRankings(1, 2024);

      expect(bettorRankingRepository.find).toHaveBeenCalledWith({
        where: { month: 1, year: 2024 },
        order: { rank: 'ASC' },
        relations: ['user'],
      });
      expect(result).toEqual(mockRankings);
    });

    it('should return empty array when no bettor rankings found', async () => {
      jest.spyOn(bettorRankingRepository, 'find').mockResolvedValue([]);

      const result = await service.getBettorRankings(13, 2024);

      expect(result).toEqual([]);
    });
  });

  describe('getBettingWeeks', () => {
    it('should return betting weeks ordered by week number', async () => {
      const mockWeeks: Partial<BettingWeek>[] = [
        { id: 'w1', weekNumber: 1, month: 1, year: 2024 },
        { id: 'w2', weekNumber: 2, month: 1, year: 2024 },
      ];

      jest
        .spyOn(bettingWeekRepository, 'find')
        .mockResolvedValue(mockWeeks as BettingWeek[]);

      const result = await service.getBettingWeeks(1, 2024);

      expect(bettingWeekRepository.find).toHaveBeenCalledWith({
        where: { month: 1, year: 2024 },
        order: { weekNumber: 'ASC' },
      });
      expect(result).toEqual(mockWeeks);
    });

    it('should return empty array when no weeks found', async () => {
      jest.spyOn(bettingWeekRepository, 'find').mockResolvedValue([]);

      const result = await service.getBettingWeeks(13, 2024);

      expect(result).toEqual([]);
    });
  });

  describe('getSeasonName (private method)', () => {
    it('should generate correct season names', async () => {
      // Test through archiveSeason which uses getSeasonName
      mockQueryRunner.manager.find.mockResolvedValue([]);
      mockQueryRunner.manager.count.mockResolvedValue(0);

      let capturedSeasonName: string = '';

      mockQueryRunner.manager.create.mockImplementation((entity, data) => {
        if (entity === SeasonArchive) {
          capturedSeasonName = data.seasonName;
          return { id: 'archive-1', ...data };
        }
        return data;
      });

      mockQueryRunner.manager.save.mockResolvedValue({ id: 'archive-1' });

      // Test January
      await service.archiveSeason(1, 2024);
      expect(capturedSeasonName).toBe('January 2024');

      // Test December
      await service.archiveSeason(12, 2024);
      expect(capturedSeasonName).toBe('December 2024');

      // Test June
      await service.archiveSeason(6, 2025);
      expect(capturedSeasonName).toBe('June 2025');
    });
  });
});
