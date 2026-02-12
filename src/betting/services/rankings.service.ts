/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BettorRanking } from '../entities/bettor-ranking.entity';

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  constructor(
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
  ) {}

  /**
   * Get monthly rankings for bettors
   *
   * Returns all bettor rankings for a specific month/year,
   * ordered by rank (ascending) and total points (descending).
   *
   * @param month - Month (1-12), optional
   * @param year - Year (e.g., 2024), optional
   * @returns List of bettor rankings
   */
  async getMonthlyRankings(
    month?: number,
    year?: number,
  ): Promise<{
    month?: number;
    year?: number;
    count: number;
    rankings: Array<{
      rank: number;
      userId: string;
      userName: string;
      totalPoints: number;
      betsPlaced: number;
      betsWon: number;
      perfectBets: number;
      boostsUsed: number;
      winRate: number;
      currentMonthlyStreak: number;
      previousWeekRank: number | null;
    }>;
  }> {
    // Build query
    const queryBuilder = this.bettorRankingRepository
      .createQueryBuilder('ranking')
      .leftJoinAndSelect('ranking.user', 'user')
      .leftJoin('user_streaks', 'streak', 'streak.userId = ranking.userId')
      .addSelect(['streak.currentMonthlyStreak']);

    // Apply filters
    if (month !== undefined) {
      queryBuilder.andWhere('ranking.month = :month', { month });
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
      totalPoints: r.totalPoints,
      betsPlaced: r.betsPlaced,
      betsWon: r.betsWon,
      perfectBets: r.perfectBets,
      boostsUsed: r.boostsUsed,
      winRate: r.betsPlaced > 0 ? (r.betsWon / r.betsPlaced) * 100 : 0,
      currentMonthlyStreak: (r as any).streak_currentMonthlyStreak || 0,
      previousWeekRank: r.previousWeekRank ?? null,
    }));

    this.logger.log(
      `Found ${formattedRankings.length} bettor rankings${month ? ` for ${month}/${year}` : ''}`,
    );

    return {
      month,
      year,
      count: formattedRankings.length,
      rankings: formattedRankings,
    };
  }

  /**
   * Get current month rankings
   *
   * Returns rankings for the current month.
   */
  async getCurrentMonthRankings(): Promise<{
    month: number;
    year: number;
    count: number;
    rankings: Array<{
      rank: number;
      userId: string;
      userName: string;
      totalPoints: number;
      betsPlaced: number;
      betsWon: number;
      perfectBets: number;
      boostsUsed: number;
      winRate: number;
      currentMonthlyStreak: number;
      previousWeekRank: number | null;
    }>;
  }> {
    const now = new Date();
    const month = now.getMonth() + 1; // JavaScript months are 0-indexed
    const year = now.getFullYear();

    const result = await this.getMonthlyRankings(month, year);

    return {
      month,
      year,
      count: result.count,
      rankings: result.rankings,
    };
  }

  /**
   * Snapshot weekly ranks for all bettors.
   * Called by cron every Sunday at 23:58 (after RECALCULATE_RANKINGS).
   *
   * Calculates current rank based on totalPoints for the current month
   * and stores it in previousWeekRank for trend calculation.
   */
  async snapshotWeeklyRanks(): Promise<void> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Get all bettor rankings for current month, sorted by totalPoints
    const rankings = await this.bettorRankingRepository.find({
      where: { month, year },
      order: { totalPoints: 'DESC' },
    });

    // Update previousWeekRank for each bettor (1-indexed)
    for (let i = 0; i < rankings.length; i++) {
      await this.bettorRankingRepository.update(rankings[i].id, {
        previousWeekRank: i + 1,
      });
    }

    this.logger.log(
      `Snapshotted weekly ranks for ${rankings.length} bettors (${month}/${year})`,
    );
  }
}
