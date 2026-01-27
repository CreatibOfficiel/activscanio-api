import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Bet } from '../entities/bet.entity';
import { BetPick } from '../entities/bet-pick.entity';
import { DailyUserStats } from '../entities/daily-user-stats.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { startOfDay, subDays, format } from 'date-fns';

/**
 * Best day of week result
 */
export interface BestDayResult {
  day: string; // 'Monday', 'Tuesday', etc.
  dayNumber: number; // 0-6 (Sunday = 0)
  totalBets: number;
  wins: number;
  winRate: number; // Percentage
}

/**
 * Favorite competitor result
 */
export interface FavoriteCompetitorResult {
  competitorId: string;
  competitorName: string;
  betCount: number;
  winCount: number;
  winRate: number; // Percentage
  totalPointsEarned: number;
}

/**
 * Betting patterns result
 */
export interface BettingPatternsResult {
  averageBetsPerWeek: number;
  mostActiveHour: number | null;
  preferredPositions: {
    first: number; // Percentage
    second: number; // Percentage
    third: number; // Percentage
  };
  avgOddsPlayed: number;
  totalBetsPlaced: number;
  totalWeeksActive: number;
}

/**
 * Win rate trend data point
 */
export interface WinRateTrendPoint {
  date: string; // YYYY-MM-DD format
  betsPlaced: number;
  betsWon: number;
  winRate: number; // Percentage
}

/**
 * AdvancedStatsService
 *
 * Provides advanced analytics for user betting behavior.
 */
@Injectable()
export class AdvancedStatsService {
  private readonly logger = new Logger(AdvancedStatsService.name);

  constructor(
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BetPick)
    private readonly betPickRepository: Repository<BetPick>,
    @InjectRepository(DailyUserStats)
    private readonly dailyStatsRepository: Repository<DailyUserStats>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
  ) {}

  /**
   * Get user's best day of the week based on win rate
   *
   * @param userId - User ID
   * @returns Best day with highest win rate
   */
  async getBestDayOfWeek(userId: string): Promise<BestDayResult | null> {
    const bets = await this.betRepository.find({
      where: { userId, isFinalized: true },
      relations: ['picks'],
    });

    if (bets.length === 0) {
      return null;
    }

    // Group bets by day of week
    const dayStats = new Map<
      number,
      { day: string; totalBets: number; wins: number }
    >();

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Initialize all days
    for (let i = 0; i < 7; i++) {
      dayStats.set(i, { day: dayNames[i], totalBets: 0, wins: 0 });
    }

    // Count bets and wins per day
    for (const bet of bets) {
      const dayOfWeek = new Date(bet.createdAt).getDay();
      const stats = dayStats.get(dayOfWeek)!;
      stats.totalBets += 1;

      // Check if bet was won (at least one correct pick)
      const hasCorrectPick = bet.picks.some((pick) => pick.isCorrect);
      if (hasCorrectPick) {
        stats.wins += 1;
      }
    }

    // Find day with highest win rate (minimum 5 bets to be significant)
    let bestDay: BestDayResult | null = null;
    let bestWinRate = 0;

    dayStats.forEach((stats, dayNumber) => {
      if (stats.totalBets >= 5) {
        const winRate = (stats.wins / stats.totalBets) * 100;
        if (winRate > bestWinRate) {
          bestWinRate = winRate;
          bestDay = {
            day: stats.day,
            dayNumber,
            totalBets: stats.totalBets,
            wins: stats.wins,
            winRate,
          };
        }
      }
    });

    return bestDay;
  }

  /**
   * Get user's favorite competitors (most bet on)
   *
   * @param userId - User ID
   * @param limit - Number of competitors to return
   * @returns List of favorite competitors with stats
   */
  async getFavoriteCompetitors(
    userId: string,
    limit: number = 10,
  ): Promise<FavoriteCompetitorResult[]> {
    // Get all finalized bets with picks
    const bets = await this.betRepository.find({
      where: { userId, isFinalized: true },
      relations: ['picks'],
    });

    if (bets.length === 0) {
      return [];
    }

    // Count picks per competitor
    const competitorStats = new Map<
      string,
      { betCount: number; winCount: number; totalPoints: number }
    >();

    for (const bet of bets) {
      for (const pick of bet.picks) {
        if (!competitorStats.has(pick.competitorId)) {
          competitorStats.set(pick.competitorId, {
            betCount: 0,
            winCount: 0,
            totalPoints: 0,
          });
        }

        const stats = competitorStats.get(pick.competitorId)!;
        stats.betCount += 1;
        if (pick.isCorrect) {
          stats.winCount += 1;
          stats.totalPoints += pick.pointsEarned;
        }
      }
    }

    // Get competitor names
    const competitorIds = Array.from(competitorStats.keys());
    const competitors =
      await this.competitorRepository.findByIds(competitorIds);

    const competitorNameMap = new Map<string, string>();
    for (const competitor of competitors) {
      const fullName = `${competitor.firstName} ${competitor.lastName}`;
      competitorNameMap.set(competitor.id, fullName);
    }

    // Build results
    const results: FavoriteCompetitorResult[] = [];
    competitorStats.forEach((stats, competitorId) => {
      results.push({
        competitorId,
        competitorName: competitorNameMap.get(competitorId) || 'Unknown',
        betCount: stats.betCount,
        winCount: stats.winCount,
        winRate: (stats.winCount / stats.betCount) * 100,
        totalPointsEarned: stats.totalPoints,
      });
    });

    // Sort by bet count (most bet on) and limit
    return results.sort((a, b) => b.betCount - a.betCount).slice(0, limit);
  }

  /**
   * Get user's betting patterns and habits
   *
   * @param userId - User ID
   * @returns Betting patterns data
   */
  async getBettingPatterns(userId: string): Promise<BettingPatternsResult> {
    const bets = await this.betRepository.find({
      where: { userId, isFinalized: true },
      relations: ['picks', 'bettingWeek'],
    });

    if (bets.length === 0) {
      return {
        averageBetsPerWeek: 0,
        mostActiveHour: null,
        preferredPositions: { first: 0, second: 0, third: 0 },
        avgOddsPlayed: 0,
        totalBetsPlaced: 0,
        totalWeeksActive: 0,
      };
    }

    // Calculate weeks active
    const uniqueWeeks = new Set<string>();
    bets.forEach((bet) => {
      if (bet.bettingWeek) {
        uniqueWeeks.add(
          `${bet.bettingWeek.year}-${bet.bettingWeek.weekNumber}`,
        );
      }
    });
    const totalWeeksActive = uniqueWeeks.size;

    // Calculate average bets per week
    const averageBetsPerWeek =
      totalWeeksActive > 0 ? bets.length / totalWeeksActive : 0;

    // Find most active hour
    const hourCounts = new Map<number, number>();
    bets.forEach((bet) => {
      const hour = new Date(bet.createdAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    let mostActiveHour: number | null = null;
    let maxCount = 0;
    hourCounts.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count;
        mostActiveHour = hour;
      }
    });

    // Calculate position preferences
    const positionCounts = { first: 0, second: 0, third: 0 };
    let totalPicks = 0;
    let totalOdds = 0;

    bets.forEach((bet) => {
      bet.picks.forEach((pick) => {
        totalPicks += 1;
        totalOdds += pick.oddAtBet;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        if (pick.position === 'first') positionCounts.first += 1;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        else if (pick.position === 'second') positionCounts.second += 1;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        else if (pick.position === 'third') positionCounts.third += 1;
      });
    });

    const preferredPositions = {
      first: totalPicks > 0 ? (positionCounts.first / totalPicks) * 100 : 0,
      second: totalPicks > 0 ? (positionCounts.second / totalPicks) * 100 : 0,
      third: totalPicks > 0 ? (positionCounts.third / totalPicks) * 100 : 0,
    };

    const avgOddsPlayed = totalPicks > 0 ? totalOdds / totalPicks : 0;

    return {
      averageBetsPerWeek,
      mostActiveHour,
      preferredPositions,
      avgOddsPlayed,
      totalBetsPlaced: bets.length,
      totalWeeksActive,
    };
  }

  /**
   * Get win rate trend over time
   *
   * @param userId - User ID
   * @param days - Number of days to look back
   * @returns Daily win rate data
   */
  async getWinRateTrend(
    userId: string,
    days: number = 30,
  ): Promise<WinRateTrendPoint[]> {
    const startDate = startOfDay(subDays(new Date(), days - 1));

    const dailyStats = await this.dailyStatsRepository.find({
      where: {
        userId,
        date: MoreThanOrEqual(startDate),
      },
      order: {
        date: 'ASC',
      },
    });

    return dailyStats.map((stat) => ({
      date: format(new Date(stat.date), 'yyyy-MM-dd'),
      betsPlaced: stat.betsPlaced,
      betsWon: stat.betsWon,
      winRate: stat.betsPlaced > 0 ? (stat.betsWon / stat.betsPlaced) * 100 : 0,
    }));
  }

  /**
   * Get stats history for graphs
   *
   * @param userId - User ID
   * @param period - Time period ('7d', '30d', '3m', '1y')
   * @returns Daily stats history
   */
  async getStatsHistory(
    userId: string,
    period: '7d' | '30d' | '3m' | '1y',
  ): Promise<DailyUserStats[]> {
    const now = new Date();
    let daysBack: number;

    switch (period) {
      case '7d':
        daysBack = 7;
        break;
      case '30d':
        daysBack = 30;
        break;
      case '3m':
        daysBack = 90;
        break;
      case '1y':
        daysBack = 365;
        break;
      default:
        daysBack = 30;
    }

    const startDate = startOfDay(subDays(now, daysBack - 1));

    return await this.dailyStatsRepository.find({
      where: {
        userId,
        date: MoreThanOrEqual(startDate),
      },
      order: {
        date: 'ASC',
      },
    });
  }

  /**
   * Get comparison stats (user vs average)
   *
   * @param userId - User ID
   * @returns Comparison data
   */
  async getComparisonStats(userId: string): Promise<{
    user: {
      totalBets: number;
      winRate: number;
      avgPointsPerBet: number;
      avgXPPerDay: number;
    };
    average: {
      totalBets: number;
      winRate: number;
      avgPointsPerBet: number;
      avgXPPerDay: number;
    };
  }> {
    // Get user bets
    const userBets = await this.betRepository.find({
      where: { userId, isFinalized: true },
      relations: ['picks'],
    });

    const userWins = userBets.filter((bet) =>
      bet.picks.some((pick) => pick.isCorrect),
    ).length;
    const userTotalPoints = userBets.reduce(
      (sum, bet) => sum + (bet.pointsEarned || 0),
      0,
    );

    // Get user daily stats for XP calculation
    const userDailyStats = await this.dailyStatsRepository.find({
      where: { userId },
    });
    const userTotalXP = userDailyStats.reduce(
      (sum, stat) => sum + stat.xpEarned,
      0,
    );
    const userActiveDays = userDailyStats.length;

    // Get all users' bets for average calculation
    const allBets = await this.betRepository.find({
      where: { isFinalized: true },
      relations: ['picks'],
    });

    const uniqueUsers = new Set(allBets.map((bet) => bet.userId));
    const avgBetsPerUser = allBets.length / uniqueUsers.size;

    const totalWins = allBets.filter((bet) =>
      bet.picks.some((pick) => pick.isCorrect),
    ).length;
    const avgWinRate =
      allBets.length > 0 ? (totalWins / allBets.length) * 100 : 0;

    const totalPoints = allBets.reduce(
      (sum, bet) => sum + (bet.pointsEarned || 0),
      0,
    );
    const avgPointsPerBet =
      allBets.length > 0 ? totalPoints / allBets.length : 0;

    // Get all daily stats for average XP
    const allDailyStats = await this.dailyStatsRepository.find();
    const totalXP = allDailyStats.reduce((sum, stat) => sum + stat.xpEarned, 0);
    const totalDays = allDailyStats.length;
    const avgXPPerDay = totalDays > 0 ? totalXP / totalDays : 0;

    return {
      user: {
        totalBets: userBets.length,
        winRate: userBets.length > 0 ? (userWins / userBets.length) * 100 : 0,
        avgPointsPerBet:
          userBets.length > 0 ? userTotalPoints / userBets.length : 0,
        avgXPPerDay: userActiveDays > 0 ? userTotalXP / userActiveDays : 0,
      },
      average: {
        totalBets: avgBetsPerUser,
        winRate: avgWinRate,
        avgPointsPerBet,
        avgXPPerDay,
      },
    };
  }
}
