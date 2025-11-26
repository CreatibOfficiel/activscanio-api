import { Expose, Type } from 'class-transformer';
import { CompetitorResponse } from '../../../competitors/dtos/responses/competitor.response';

/**
 * Response DTO for BetPick entity
 * Represents a single pick within a bet (podium prediction)
 */
export class BetPickResponse {
  @Expose()
  id: string;

  @Expose()
  betId: string;

  @Expose()
  competitorId: string;

  @Expose()
  @Type(() => CompetitorResponse)
  competitor?: CompetitorResponse;

  @Expose()
  podiumPosition: number;

  @Expose()
  @Type(() => Date)
  createdAt: Date;
}
