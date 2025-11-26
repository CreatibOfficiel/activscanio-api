import { Expose, Type } from 'class-transformer';
import { CompetitorResponse } from '../../../competitors/dtos/responses/competitor.response';

/**
 * Response DTO for CompetitorMonthlyStats entity
 * Represents a competitor's statistics for a specific month
 */
export class CompetitorMonthlyStatsResponse {
  @Expose()
  id: string;

  @Expose()
  competitorId: string;

  @Expose()
  @Type(() => CompetitorResponse)
  competitor?: CompetitorResponse;

  @Expose()
  month: number;

  @Expose()
  year: number;

  @Expose()
  initialRating: number;

  @Expose()
  finalRating: number;

  @Expose()
  ratingChange: number;

  @Expose()
  racesCompleted: number;

  @Expose()
  winsCount: number;

  @Expose()
  podiumCount: number;

  @Expose()
  averageRank: number;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
