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
}
