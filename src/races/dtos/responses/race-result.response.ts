import { Expose, Type } from 'class-transformer';
import { CompetitorResponse } from '../../../competitors/dtos/responses/competitor.response';

/**
 * Response DTO for RaceResult entity
 * Represents a single competitor's result in a race
 */
export class RaceResultResponse {
  @Expose()
  id: string;

  @Expose()
  competitorId: string;

  @Expose()
  @Type(() => CompetitorResponse)
  competitor?: CompetitorResponse;

  @Expose()
  rank12: number;

  @Expose()
  score: number;
}
