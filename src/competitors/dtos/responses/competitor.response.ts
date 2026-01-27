import { Expose, Type, Transform } from 'class-transformer';

/**
 * Response DTO for Competitor entity
 * Used for all API responses involving competitors
 */
export class CompetitorResponse {
  @Expose()
  id: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  @Transform(({ obj }) => `${obj.firstName} ${obj.lastName}`)
  fullName: string;

  @Expose()
  profilePictureUrl: string;

  @Expose()
  rating: number;

  @Expose()
  rd: number;

  @Expose()
  vol: number;

  /**
   * Conservative rating score (rating - 2*RD)
   * Used for more reliable skill estimation
   */
  @Expose()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  @Transform(({ obj }) => obj.rating - 2 * obj.rd)
  conservativeScore: number;

  @Expose()
  raceCount: number;

  @Expose()
  avgRank12: number;

  @Expose()
  @Type(() => Date)
  lastRaceDate: Date | null;

  @Expose()
  winStreak: number;

  @Expose()
  currentMonthRaceCount: number;

  @Expose()
  isActiveThisWeek: boolean;
}
