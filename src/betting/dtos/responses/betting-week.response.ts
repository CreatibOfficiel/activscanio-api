import { Expose, Type } from 'class-transformer';
import { BettingWeekStatus } from '../../entities/betting-week.entity';
import { CompetitorResponse } from '../../../competitors/dtos/responses/competitor.response';

/**
 * Response DTO for BettingWeek entity
 * Used for all API responses involving betting weeks
 */
export class BettingWeekResponse {
  @Expose()
  id: string;

  @Expose()
  weekNumber: number;

  @Expose()
  year: number;

  @Expose()
  month: number;

  @Expose()
  @Type(() => Date)
  startDate: Date;

  @Expose()
  @Type(() => Date)
  endDate: Date;

  @Expose()
  status: BettingWeekStatus;

  @Expose()
  podiumFirstId: string | null;

  @Expose()
  podiumSecondId: string | null;

  @Expose()
  podiumThirdId: string | null;

  @Expose()
  @Type(() => CompetitorResponse)
  podiumFirst?: CompetitorResponse;

  @Expose()
  @Type(() => CompetitorResponse)
  podiumSecond?: CompetitorResponse;

  @Expose()
  @Type(() => CompetitorResponse)
  podiumThird?: CompetitorResponse;

  @Expose()
  @Type(() => Date)
  finalizedAt: Date | null;

  @Expose()
  @Type(() => Date)
  createdAt: Date;
}
