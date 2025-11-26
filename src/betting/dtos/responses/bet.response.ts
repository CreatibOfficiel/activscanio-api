import { Expose, Type } from 'class-transformer';
import { BetPickResponse } from './bet-pick.response';

/**
 * Response DTO for Bet entity
 * Used for all API responses involving bets
 */
export class BetResponse {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  bettingWeekId: string;

  @Expose()
  @Type(() => Date)
  placedAt: Date;

  @Expose()
  isFinalized: boolean;

  @Expose()
  pointsEarned: number | null;

  @Expose()
  @Type(() => BetPickResponse)
  picks: BetPickResponse[];

  @Expose()
  achievementsUnlocked?: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    category: string;
    rarity: string;
    icon: string;
    xpReward: number;
    unlocksTitle: string | null;
    unlockedAt: Date;
  }>;

  @Expose()
  @Type(() => Date)
  createdAt: Date;
}
