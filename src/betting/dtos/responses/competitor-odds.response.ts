import { Expose, Type } from 'class-transformer';
import { CompetitorResponse } from '../../../competitors/dtos/responses/competitor.response';

/**
 * Response DTO for CompetitorOdds entity
 * Represents calculated odds for a competitor in a betting week
 */
export class CompetitorOddsResponse {
  @Expose()
  id: string;

  @Expose()
  bettingWeekId: string;

  @Expose()
  competitorId: string;

  @Expose()
  @Type(() => CompetitorResponse)
  competitor?: CompetitorResponse;

  /** @deprecated Use oddFirst, oddSecond, oddThird instead */
  @Expose()
  odd: number;

  @Expose()
  oddFirst: number;

  @Expose()
  oddSecond: number;

  @Expose()
  oddThird: number;

  @Expose()
  @Type(() => Date)
  calculatedAt: Date;

  @Expose()
  @Type(() => Date)
  createdAt: Date;
}
