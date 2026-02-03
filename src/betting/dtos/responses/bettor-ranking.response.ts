import { Expose, Type } from 'class-transformer';

/**
 * Response DTO for BettorRanking entity
 * Represents a user's ranking for a specific month
 */
export class BettorRankingResponse {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  month: number;

  @Expose()
  year: number;

  @Expose()
  totalPoints: number;

  @Expose()
  rank: number;

  @Expose()
  betsPlaced: number;

  @Expose()
  currentMonthlyStreak: number;

  /**
   * Previous week rank for trend calculation.
   * Used to show if bettor is rising/falling in rankings.
   */
  @Expose()
  previousWeekRank: number | null;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
