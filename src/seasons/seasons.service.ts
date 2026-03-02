import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, QueryRunner, Between } from 'typeorm';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BetPick } from '../betting/entities/bet-pick.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';
import { RaceEvent } from '../races/race-event.entity';
import { SeasonUtils } from '../betting/utils/season-utils';
import { WeekUtils } from '../betting/services/week-manager.service';

export interface SeasonHighlights {
  perfectScores: { userName: string; week: number; points: number }[];
  perfectPodiums: { userName: string; week: number; points: number }[];
  highestBetScore: {
    userName: string;
    week: number;
    points: number;
  } | null;
  biggestUpset: {
    userName: string;
    competitorName: string;
    odd: number;
    week: number;
  } | null;
  longestParticipationStreak: { userName: string; streak: number } | null;
  longestWinStreak: { competitorName: string; streak: number } | null;
  mostRaces: { competitorName: string; count: number } | null;
  bestRaceScorers: { competitorName: string; maxScore: number; perfectCount: number }[] | null;
}

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
    @InjectRepository(BetPick)
    private readonly betPickRepository: Repository<BetPick>,
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
  ) {}

  /**
   * Archive the current season
   * Called during season transition (first week of new season)
   */
  async archiveSeason(
    seasonNumber: number,
    year: number,
  ): Promise<SeasonArchive> {
    this.logger.log(`Archiving season ${seasonNumber}/${year}...`);

    // Use transaction for atomicity
    const queryRunner =
      this.seasonArchiveRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calculate date range from the season's weeks
      const seasonWeeks = SeasonUtils.getSeasonWeeks(seasonNumber);
      const startDate = WeekUtils.getMondayOfWeek(year, seasonWeeks.start);
      const endDate = WeekUtils.getSundayOfWeek(year, seasonWeeks.end);

      // Gather statistics
      const competitors = await queryRunner.manager.find(Competitor);

      // Only count competitors who actually raced this season
      const activeCompetitors = competitors.filter(
        (c) => c.currentMonthRaceCount > 0,
      );

      // Count races within the season date range
      const totalRaces = await queryRunner.manager.count(RaceEvent, {
        where: { date: Between(startDate, endDate) },
      });

      const bets = await queryRunner.manager.count(Bet, {
        where: {
          bettingWeek: { seasonNumber, year },
        },
      });

      const bettorRankings = await queryRunner.manager.count(BettorRanking, {
        where: { seasonNumber, year },
      });

      // Create season archive
      const archive = queryRunner.manager.create(SeasonArchive, {
        month: seasonNumber, // backward compat
        seasonNumber,
        year,
        seasonName: this.getSeasonName(seasonNumber, year),
        startDate,
        endDate,
        totalCompetitors: activeCompetitors.length,
        totalBettors: bettorRankings,
        totalRaces,
        totalBets: bets,
      });

      await queryRunner.manager.save(archive);

      // Archive competitor rankings
      await this.archiveCompetitorRankingsInTransaction(
        queryRunner,
        archive,
        competitors,
      );

      // Link betting weeks to archive
      await queryRunner.manager.update(
        BettingWeek,
        { seasonNumber, year },
        { seasonArchiveId: archive.id },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Season ${seasonNumber}/${year} archived successfully (ID: ${archive.id})`,
      );

      return archive;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to archive season ${seasonNumber}/${year}:`,
        error,
      );
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
    // Determine status for each competitor (same logic as competitor-classification.ts)
    const INACTIVE_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000; // 8 days
    const seasonEndTime = archive.endDate.getTime();

    const withStatus = competitors.map((c) => {
      const provisional = c.raceCount < 5 || c.rd > 150;
      const inactive =
        !provisional &&
        (!c.lastRaceDate ||
          seasonEndTime - new Date(c.lastRaceDate).getTime() >
            INACTIVE_THRESHOLD_MS);

      return {
        competitor: c,
        score: c.rating - 2 * c.rd,
        provisional,
        inactive,
      };
    });

    // Separate into confirmed (ranked), inactive, and calibrating (provisional)
    const confirmed = withStatus
      .filter((c) => !c.provisional && !c.inactive)
      .sort((a, b) => b.score - a.score);
    const calibrating = withStatus
      .filter((c) => c.provisional || c.inactive)
      .sort((a, b) => b.score - a.score);

    // Pre-calculate ranks with ties on the full confirmed list
    const confirmedRanks: number[] = [];
    let currentRank = 1;
    for (let i = 0; i < confirmed.length; i++) {
      if (i > 0 && confirmed[i].score < confirmed[i - 1].score) {
        currentRank = i + 1;
      }
      confirmedRanks.push(currentRank);
    }

    // Archive confirmed competitors with official ranks
    const BATCH_SIZE = 100;
    for (let i = 0; i < confirmed.length; i += BATCH_SIZE) {
      const batch = confirmed.slice(i, i + BATCH_SIZE);

      const rankings = batch.map((item, batchIndex) => {
        const { competitor } = item;
        const rank = confirmedRanks[i + batchIndex];

        return queryRunner.manager.create(ArchivedCompetitorRanking, {
          seasonArchiveId: archive.id,
          competitorId: competitor.id,
          competitorName: `${competitor.firstName} ${competitor.lastName}`,
          rank,
          provisional: false,
          finalRating: competitor.rating,
          finalRd: competitor.rd,
          finalVol: competitor.vol,
          totalRaces: competitor.currentMonthRaceCount,
          winStreak: competitor.winStreak,
          avgRank12: competitor.avgRank12,
        });
      });

      await queryRunner.manager.save(rankings);

      this.logger.log(
        `Archived batch ${Math.floor(i / BATCH_SIZE) + 1}: ${rankings.length} confirmed competitors`,
      );
    }

    // Archive calibrating competitors with provisional = true and rank = null
    for (let i = 0; i < calibrating.length; i += BATCH_SIZE) {
      const batch = calibrating.slice(i, i + BATCH_SIZE);

      const rankings = batch.map((item) => {
        const { competitor } = item;

        return queryRunner.manager.create(ArchivedCompetitorRanking, {
          seasonArchiveId: archive.id,
          competitorId: competitor.id,
          competitorName: `${competitor.firstName} ${competitor.lastName}`,
          rank: null,
          provisional: true,
          finalRating: competitor.rating,
          finalRd: competitor.rd,
          finalVol: competitor.vol,
          totalRaces: competitor.currentMonthRaceCount,
          winStreak: competitor.winStreak,
          avgRank12: competitor.avgRank12,
        });
      });

      await queryRunner.manager.save(rankings);

      this.logger.log(
        `Archived batch: ${rankings.length} provisional competitors`,
      );
    }

    this.logger.log(
      `Archived ${confirmed.length} confirmed + ${calibrating.length} provisional competitor rankings for season ${archive.month}/${archive.year}`,
    );
  }

  /**
   * Get all seasons (for browsing history)
   */
  async getAllSeasons(): Promise<SeasonArchive[]> {
    return await this.seasonArchiveRepository.find({
      order: { year: 'DESC', seasonNumber: 'DESC' },
    });
  }

  /**
   * Get a specific season by seasonNumber (or legacy month)
   */
  async getSeason(
    seasonNumber: number,
    year: number,
  ): Promise<SeasonArchive | null> {
    return await this.seasonArchiveRepository.findOne({
      where: { seasonNumber, year },
      relations: ['competitorRankings'],
    });
  }

  /**
   * Get competitor rankings for a season, enriched with profile pictures
   * and character images from the live competitor data
   */
  async getCompetitorRankings(seasonId: string) {
    const rankings = await this.archivedCompetitorRankingRepository.find({
      where: { seasonArchiveId: seasonId },
      order: { rank: 'ASC' },
    });

    // Fetch live competitor data for profile pics and character images
    const competitorIds = rankings.map((r) => r.competitorId);
    const competitors = await this.competitorRepository.find({
      where: { id: In(competitorIds) },
      relations: ['characterVariant'],
    });
    const competitorMap = new Map(competitors.map((c) => [c.id, c]));

    return rankings.map((r) => {
      const competitor = competitorMap.get(r.competitorId);
      return {
        ...r,
        profilePictureUrl: competitor?.profilePictureUrl ?? null,
        characterImageUrl: competitor?.characterVariant?.imageUrl ?? null,
      };
    });
  }

  /**
   * Get bettor rankings for a season (enriched with user info)
   */
  async getBettorRankings(
    seasonNumber: number,
    year: number,
  ) {
    const rankings = await this.bettorRankingRepository.find({
      where: { seasonNumber, year },
      order: { rank: 'ASC' },
      relations: ['user', 'user.competitor'],
    });

    return rankings.map((r) => ({
      userId: r.userId,
      userName: r.user
        ? `${r.user.firstName} ${r.user.lastName}`.trim()
        : 'Inconnu',
      profilePictureUrl: r.user?.competitor?.profilePictureUrl ?? r.user?.profilePictureUrl ?? null,
      rank: r.rank,
      totalPoints: r.totalPoints,
      betsPlaced: r.betsPlaced,
    }));
  }

  /**
   * Get betting weeks for a season
   */
  async getBettingWeeks(
    seasonNumber: number,
    year: number,
  ): Promise<BettingWeek[]> {
    return await this.bettingWeekRepository.find({
      where: { seasonNumber, year },
      order: { weekNumber: 'ASC' },
    });
  }

  /**
   * Get season highlights for the "Wrapped" recap
   */
  async getSeasonHighlights(
    seasonNumber: number,
    year: number,
  ): Promise<SeasonHighlights> {
    // Perfect scores (60 pts)
    const perfectScores = await this.betRepository
      .createQueryBuilder('bet')
      .innerJoin('bet.user', 'user')
      .innerJoin('bet.bettingWeek', 'week')
      .select([
        "CONCAT(user.firstName, ' ', user.lastName) AS \"userName\"",
        'week.seasonWeekNumber AS week',
        'bet.pointsEarned AS points',
      ])
      .where('week."seasonNumber" = :seasonNumber AND week.year = :year', {
        seasonNumber,
        year,
      })
      .andWhere('bet.pointsEarned = 60')
      .andWhere('bet.isFinalized = true')
      .orderBy('week.seasonWeekNumber', 'ASC')
      .getRawMany();

    // Perfect podiums (all 3 picks correct)
    const perfectPodiums = await this.betRepository
      .createQueryBuilder('bet')
      .innerJoin('bet.user', 'user')
      .innerJoin('bet.bettingWeek', 'week')
      .innerJoin('bet.picks', 'pick')
      .select([
        "CONCAT(user.firstName, ' ', user.lastName) AS \"userName\"",
        'week.seasonWeekNumber AS week',
        'bet.pointsEarned AS points',
      ])
      .where('week."seasonNumber" = :seasonNumber AND week.year = :year', {
        seasonNumber,
        year,
      })
      .andWhere('bet.isFinalized = true')
      .groupBy('bet.id')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .addGroupBy('week.seasonWeekNumber')
      .addGroupBy('bet.pointsEarned')
      .having(
        'COUNT(pick.id) = SUM(CASE WHEN pick.isCorrect = true THEN 1 ELSE 0 END)',
      )
      .andHaving('COUNT(pick.id) = 3')
      .orderBy('week.seasonWeekNumber', 'ASC')
      .getRawMany();

    // Highest single bet score
    const highestBetScoreRaw = await this.betRepository
      .createQueryBuilder('bet')
      .innerJoin('bet.user', 'user')
      .innerJoin('bet.bettingWeek', 'week')
      .select([
        "CONCAT(user.firstName, ' ', user.lastName) AS \"userName\"",
        'week.seasonWeekNumber AS week',
        'bet.pointsEarned AS points',
      ])
      .where('week."seasonNumber" = :seasonNumber AND week.year = :year', {
        seasonNumber,
        year,
      })
      .andWhere('bet.isFinalized = true')
      .andWhere('bet.pointsEarned IS NOT NULL')
      .orderBy('bet.pointsEarned', 'DESC')
      .limit(1)
      .getRawOne();

    // Biggest upset: correct pick with highest odd
    const biggestUpsetRaw = await this.betPickRepository
      .createQueryBuilder('pick')
      .innerJoin('pick.bet', 'bet')
      .innerJoin('bet.user', 'user')
      .innerJoin('bet.bettingWeek', 'week')
      .innerJoin('pick.competitor', 'competitor')
      .select([
        "CONCAT(user.firstName, ' ', user.lastName) AS \"userName\"",
        "CONCAT(competitor.firstName, ' ', competitor.lastName) AS \"competitorName\"",
        'pick.oddAtBet AS odd',
        'week.seasonWeekNumber AS week',
      ])
      .where('week."seasonNumber" = :seasonNumber AND week.year = :year', {
        seasonNumber,
        year,
      })
      .andWhere('pick.isCorrect = true')
      .orderBy('pick.oddAtBet', 'DESC')
      .limit(1)
      .getRawOne();

    // Longest participation streak
    const longestParticipationStreakRaw = await this.bettorRankingRepository
      .createQueryBuilder('ranking')
      .innerJoin('ranking.user', 'user')
      .select([
        "CONCAT(user.firstName, ' ', user.lastName) AS \"userName\"",
        'ranking.weeklyParticipationStreak AS streak',
      ])
      .where(
        'ranking."seasonNumber" = :seasonNumber AND ranking.year = :year',
        { seasonNumber, year },
      )
      .orderBy('ranking.weeklyParticipationStreak', 'DESC')
      .limit(1)
      .getRawOne();

    // Longest win streak (from archived competitor rankings)
    const season = await this.getSeason(seasonNumber, year);
    let longestWinStreak: SeasonHighlights['longestWinStreak'] = null;
    let mostRaces: SeasonHighlights['mostRaces'] = null;

    if (season) {
      const longestWinStreakRaw = await this.archivedCompetitorRankingRepository
        .createQueryBuilder('acr')
        .select([
          'acr.competitorName AS "competitorName"',
          'acr.winStreak AS streak',
        ])
        .where('acr.seasonArchiveId = :seasonId', { seasonId: season.id })
        .orderBy('acr.winStreak', 'DESC')
        .limit(1)
        .getRawOne();

      if (longestWinStreakRaw && longestWinStreakRaw.streak > 0) {
        longestWinStreak = {
          competitorName: longestWinStreakRaw.competitorName,
          streak: Number(longestWinStreakRaw.streak),
        };
      }

      // Most races
      const mostRacesRaw = await this.archivedCompetitorRankingRepository
        .createQueryBuilder('acr')
        .select([
          'acr.competitorName AS "competitorName"',
          'acr.totalRaces AS count',
        ])
        .where('acr.seasonArchiveId = :seasonId', { seasonId: season.id })
        .orderBy('acr.totalRaces', 'DESC')
        .limit(1)
        .getRawOne();

      if (mostRacesRaw && mostRacesRaw.count > 0) {
        mostRaces = {
          competitorName: mostRacesRaw.competitorName,
          count: Number(mostRacesRaw.count),
        };
      }
    }

    // Best race scorers (perfect 60-point races)
    let bestRaceScorers: SeasonHighlights['bestRaceScorers'] = null;

    if (season) {
      const bestRaceScorersRaw = await this.seasonArchiveRepository.manager
        .createQueryBuilder()
        .select([
          'CONCAT(c."firstName", \' \', c."lastName") AS "competitorName"',
          'MAX(rr.score) AS "maxScore"',
          'SUM(CASE WHEN rr.score = 60 THEN 1 ELSE 0 END) AS "perfectCount"',
        ])
        .from('race_results', 'rr')
        .innerJoin('races', 'r', 'r.id = rr."raceId"')
        .innerJoin('competitors', 'c', 'c.id = rr."competitorId"')
        .where('r.date BETWEEN :startDate AND :endDate', {
          startDate: season.startDate,
          endDate: season.endDate,
        })
        .groupBy('c.id, c."firstName", c."lastName"')
        .having('MAX(rr.score) = 60')
        .orderBy('"perfectCount"', 'DESC')
        .getRawMany();

      if (bestRaceScorersRaw?.length > 0) {
        bestRaceScorers = bestRaceScorersRaw.map((r) => ({
          competitorName: r.competitorName,
          maxScore: Number(r.maxScore),
          perfectCount: Number(r.perfectCount),
        }));
      }
    }

    return {
      perfectScores: perfectScores.map((r) => ({
        userName: r.userName,
        week: Number(r.week),
        points: Number(r.points),
      })),
      perfectPodiums: perfectPodiums.map((r) => ({
        userName: r.userName,
        week: Number(r.week),
        points: Number(r.points),
      })),
      highestBetScore: highestBetScoreRaw
        ? {
            userName: highestBetScoreRaw.userName,
            week: Number(highestBetScoreRaw.week),
            points: Number(highestBetScoreRaw.points),
          }
        : null,
      biggestUpset: biggestUpsetRaw
        ? {
            userName: biggestUpsetRaw.userName,
            competitorName: biggestUpsetRaw.competitorName,
            odd: Number(biggestUpsetRaw.odd),
            week: Number(biggestUpsetRaw.week),
          }
        : null,
      longestParticipationStreak:
        longestParticipationStreakRaw &&
        longestParticipationStreakRaw.streak > 0
          ? {
              userName: longestParticipationStreakRaw.userName,
              streak: Number(longestParticipationStreakRaw.streak),
            }
          : null,
      longestWinStreak,
      mostRaces,
      bestRaceScorers,
    };
  }

  /**
   * Generate season name
   */
  private getSeasonName(seasonNumber: number, year: number): string {
    return `Saison ${seasonNumber} - ${year}`;
  }
}
