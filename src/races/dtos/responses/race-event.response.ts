import { Expose, Type } from 'class-transformer';
import { RaceResultResponse } from './race-result.response';

/**
 * Response DTO for RaceEvent entity
 * Used for all API responses involving race events
 */
export class RaceEventResponse {
  @Expose()
  id: string;

  @Expose()
  @Type(() => Date)
  date: Date;

  @Expose()
  month: number;

  @Expose()
  year: number;

  @Expose()
  bettingWeekId: string | null;

  @Expose()
  @Type(() => RaceResultResponse)
  results: RaceResultResponse[];
}
