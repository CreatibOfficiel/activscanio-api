/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BettorRanking } from '../entities/bettor-ranking.entity';
import { SeasonUtils } from '../utils/season-utils';
import { WeekUtils } from './week-manager.service';

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  constructor(
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
  ) {}

  /**
   * Get season rankings for bettors
   *
   * Returns all bettor rankings for a specific season/year,
   * ordered by rank (ascending) and total points (descending).
   *
   * @param seasonNumber - Season (1-13), optional. Also accepts month (1-12) for backward compat.
   * @param year - Year (e.g., 2024), optional
   * @returns List of bettor rankings
   */
  async getMonthlyRankings(
    seasonNumber?: number,
    year?: number,
  ): Promise<{
    month?: number;
    seasonNumber?: number;
    year?: number;
    count: number;
    rankings: Array<{
      rank: number;
      userId: string;
      userName: string;
      profilePictureUrl: string | null;
      firstName: string | null;
      lastName: string | null;
      totalPoints: number;
      betsPlaced: number;
      betsWon: number;
      perfectBets: number;
      boostsUsed: number;
      winRate: number;
      currentMonthlyStreak: number;
      currentWinStreak: number;
      previousWeekRank: number | null;
    }>;
  }> {
    // Build query
    const queryBuilder = this.bettorRankingRepository
      .createQueryBuilder('ranking')
      .leftJoinAndSelect('ranking.user', 'user')
      .leftJoin('user.competitor', 'competitor')
      .addSelect(['competitor.profilePictureUrl'])
      .leftJoin('user_streaks', 'streak', 'streak.userId = ranking.userId')
      .addSelect(['streak.currentMonthlyStreak', 'streak.currentWinStreak']);

    // Apply filters using seasonNumber
    if (seasonNumber !== undefined) {
      queryBuilder.andWhere('ranking.seasonNumber = :seasonNumber', {
        seasonNumber,
      });
    }

    if (year !== undefined) {
      queryBuilder.andWhere('ranking.year = :year', { year });
    }

    // Order by rank (ASC) and total points (DESC)
    queryBuilder
      .orderBy('ranking.rank', 'ASC', 'NULLS LAST')
      .addOrderBy('ranking.totalPoints', 'DESC');

    const rankings = await queryBuilder.getMany();

    // Calculate win rate and format response
    const formattedRankings = rankings.map((r) => ({
      rank: r.rank || 0,
      userId: r.userId,
      userName: r.user
        ? `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() ||
          r.user.email
        : 'Unknown',
      profilePictureUrl: r.user?.competitor?.profilePictureUrl ?? r.user?.profilePictureUrl ?? null,
      firstName: r.user?.firstName ?? null,
      lastName: r.user?.lastName ?? null,
      totalPoints: r.totalPoints,
      betsPlaced: r.betsPlaced,
      betsWon: r.betsWon,
      perfectBets: r.perfectBets,
      boostsUsed: r.boostsUsed,
      winRate: r.betsPlaced > 0 ? (r.betsWon / r.betsPlaced) * 100 : 0,
      currentMonthlyStreak: (r as any).streak_currentMonthlyStreak || 0,
      currentWinStreak: (r as any).streak_currentWinStreak || 0,
      previousWeekRank: r.previousWeekRank ?? null,
    }));

    this.logger.log(
      `Found ${formattedRankings.length} bettor rankings${seasonNumber ? ` for season ${seasonNumber}/${year}` : ''}`,
    );

    return {
      month: seasonNumber,
      seasonNumber,
      year,
      count: formattedRankings.length,
      rankings: formattedRankings,
    };
  }

  /**
   * Get current season rankings
   *
   * Returns rankings for the current 4-week season.
   */
  async getCurrentMonthRankings(): Promise<{
    month: number;
    seasonNumber: number;
    year: number;
    count: number;
    rankings: Array<{
      rank: number;
      userId: string;
      userName: string;
      profilePictureUrl: string | null;
      firstName: string | null;
      lastName: string | null;
      totalPoints: number;
      betsPlaced: number;
      betsWon: number;
      perfectBets: number;
      boostsUsed: number;
      winRate: number;
      currentMonthlyStreak: number;
      currentWinStreak: number;
      previousWeekRank: number | null;
    }>;
  }> {
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = WeekUtils.getISOWeek(now);
    const seasonNumber = SeasonUtils.getSeasonNumber(weekNumber, year);

    const result = await this.getMonthlyRankings(seasonNumber, year);

    return {
      month: seasonNumber,
      seasonNumber,
      year,
      count: result.count,
      rankings: result.rankings,
    };
  }

  /**
   * Snapshot weekly ranks for all bettors.
   * Called by cron every Sunday at 20:05 (after RECALCULATE_RANKINGS).
   *
   * Calculates current rank based on totalPoints for the current season
   * and stores it in previousWeekRank for trend calculation.
   */
  async snapshotWeeklyRanks(): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = WeekUtils.getISOWeek(now);
    const seasonNumber = SeasonUtils.getSeasonNumber(weekNumber, year);

    // Get all bettor rankings for current season, sorted by totalPoints
    const rankings = await this.bettorRankingRepository.find({
      where: { seasonNumber, year },
      order: { totalPoints: 'DESC' },
    });

    // Update previousWeekRank for each bettor (1-indexed)
    for (let i = 0; i < rankings.length; i++) {
      await this.bettorRankingRepository.update(rankings[i].id, {
        previousWeekRank: i + 1,
      });
    }

    this.logger.log(
      `Snapshotted weekly ranks for ${rankings.length} bettors (season ${seasonNumber}/${year})`,
    );
  }
}
