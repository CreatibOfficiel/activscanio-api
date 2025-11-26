import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    @InjectRepository(SeasonArchive)
    private readonly seasonArchiveRepository: Repository<SeasonArchive>,
    @InjectRepository(ArchivedCompetitorRanking)
    private readonly archivedCompetitorRankingRepository: Repository<ArchivedCompetitorRanking>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
  ) {}

  /**
   * Archive the current season
   * Called by monthly cron job
   */
  async archiveSeason(month: number, year: number): Promise<SeasonArchive> {
    this.logger.log(`Archiving season ${month}/${year}...`);

    // Use transaction for atomicity
    const queryRunner = this.seasonArchiveRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calculate date range
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      // Gather statistics
      const competitors = await queryRunner.manager.find(Competitor);
      const bettingWeeks = await queryRunner.manager.find(BettingWeek, {
        where: { month, year },
      });

      // Note: totalRaces is set to 0 as there is currently no direct relation
      // between BettingWeek and Race entities in the database schema.
      // To implement race counting per season:
      // 1. Add a `weekId` foreign key to the Race entity, OR
      // 2. Add a `raceCount` field to BettingWeek that increments on race creation
      // For now, this metric is not tracked at the season level.
      const totalRaces = 0;

      const bets = await queryRunner.manager.count(Bet, {
        where: {
          bettingWeek: { month, year },
        },
      });

      const bettorRankings = await queryRunner.manager.count(BettorRanking, {
        where: { month, year },
      });

      // Create season archive
      const archive = queryRunner.manager.create(SeasonArchive, {
        month,
        year,
        seasonName: this.getSeasonName(month, year),
        startDate,
        endDate,
        totalCompetitors: competitors.length,
        totalBettors: bettorRankings,
        totalRaces,
        totalBets: bets,
      });

      await queryRunner.manager.save(archive);

      // Archive competitor rankings
      await this.archiveCompetitorRankingsInTransaction(queryRunner, archive, competitors);

      // Link betting weeks to archive
      await queryRunner.manager.update(
        BettingWeek,
        { month, year },
        { seasonArchiveId: archive.id },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Season ${month}/${year} archived successfully (ID: ${archive.id})`,
      );

      return archive;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to archive season ${month}/${year}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Archive competitor rankings for the season (within transaction)
   */
  private async archiveCompetitorRankingsInTransaction(
    queryRunner: QueryRunner,
    archive: SeasonArchive,
    competitors: Competitor[],
  ): Promise<void> {
    // Sort competitors by conservative score (rating - 2*rd)
    const sorted = competitors
      .map((c) => ({
        competitor: c,
        score: c.rating - 2 * c.rd,
      }))
      .sort((a, b) => b.score - a.score);

    // Create archive records in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
      const batch = sorted.slice(i, i + BATCH_SIZE);

      const rankings = batch.map((item, batchIndex) => {
        const { competitor } = item;
        const rank = i + batchIndex + 1;

        return queryRunner.manager.create(ArchivedCompetitorRanking, {
          seasonArchiveId: archive.id,
          competitorId: competitor.id,
          competitorName: `${competitor.firstName} ${competitor.lastName}`,
          rank,
          finalRating: competitor.rating,
          finalRd: competitor.rd,
          finalVol: competitor.vol,
          totalRaces: competitor.raceCount,
          winStreak: competitor.winStreak,
          avgRank12: competitor.avgRank12,
        });
      });

      await queryRunner.manager.save(rankings);

      this.logger.log(
        `Archived batch ${Math.floor(i / BATCH_SIZE) + 1}: ${rankings.length} competitors`,
      );
    }

    this.logger.log(
      `Archived ${sorted.length} competitor rankings for season ${archive.month}/${archive.year}`,
    );
  }

  /**
   * Get all seasons (for browsing history)
   */
  async getAllSeasons(): Promise<SeasonArchive[]> {
    return await this.seasonArchiveRepository.find({
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  /**
   * Get a specific season
   */
  async getSeason(month: number, year: number): Promise<SeasonArchive | null> {
    return await this.seasonArchiveRepository.findOne({
      where: { month, year },
      relations: ['competitorRankings'],
    });
  }

  /**
   * Get competitor rankings for a season
   */
  async getCompetitorRankings(
    seasonId: string,
  ): Promise<ArchivedCompetitorRanking[]> {
    return await this.archivedCompetitorRankingRepository.find({
      where: { seasonArchiveId: seasonId },
      order: { rank: 'ASC' },
    });
  }

  /**
   * Get bettor rankings for a season
   */
  async getBettorRankings(
    month: number,
    year: number,
  ): Promise<BettorRanking[]> {
    return await this.bettorRankingRepository.find({
      where: { month, year },
      order: { rank: 'ASC' },
      relations: ['user'],
    });
  }

  /**
   * Get betting weeks for a season
   */
  async getBettingWeeks(
    month: number,
    year: number,
  ): Promise<BettingWeek[]> {
    return await this.bettingWeekRepository.find({
      where: { month, year },
      order: { weekNumber: 'ASC' },
    });
  }

  /**
   * Generate season name
   */
  private getSeasonName(month: number, year: number): string {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${monthNames[month - 1]} ${year}`;
  }
}
