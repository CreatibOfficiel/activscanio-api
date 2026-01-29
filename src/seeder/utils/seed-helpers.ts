import { faker } from '@faker-js/faker';

// Set a deterministic seed for reproducible data
const SEED_NUMBER = 42;
faker.seed(SEED_NUMBER);

/**
 * Seeded random number generator for deterministic results
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number = SEED_NUMBER) {
    this.seed = seed;
  }

  // Simple mulberry32 PRNG
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Random integer between min and max (inclusive)
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Random float between min and max
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  // Random boolean with optional probability (0-1)
  bool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  // Pick random element from array
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Pick N unique random elements from array
  pickMultiple<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => this.next() - 0.5);
    return shuffled.slice(0, count);
  }

  // Shuffle array
  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// Global seeded random instance
export const seededRandom = new SeededRandom(SEED_NUMBER);

/**
 * Date helpers
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWeekStartDate(year: number, weekNumber: number): Date {
  const jan1 = new Date(year, 0, 1);
  const daysOffset = (weekNumber - 1) * 7;
  const dayOfWeek = jan1.getDay();
  const mondayOffset = dayOfWeek <= 4 ? 1 - dayOfWeek : 8 - dayOfWeek;
  const weekStart = new Date(jan1);
  weekStart.setDate(jan1.getDate() + mondayOffset + daysOffset);
  return weekStart;
}

export function getWeekEndDate(weekStartDate: Date): Date {
  const endDate = new Date(weekStartDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
}

export function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
}

export function subtractWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - weeks * 7);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Mario Kart scoring system (12 players)
 */
export const MK_SCORES = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function getScoreForRank(rank: number): number {
  return MK_SCORES[rank - 1] || 0;
}

/**
 * Odds calculation helpers
 */
export function calculateSimpleOdds(
  rating: number,
  avgRating: number = 1500,
): number {
  // Higher rating = lower odds (more likely to win)
  const ratingDiff = rating - avgRating;
  const probability = 1 / (1 + Math.pow(10, -ratingDiff / 400));
  // Convert probability to odds (1/probability), clamped to reasonable range
  const rawOdds = 1 / Math.max(probability, 0.01);
  return Math.min(Math.max(rawOdds, 1.1), 20);
}

/**
 * Glicko-2 rating helpers (simplified for seeding)
 */
export function updateRatingSimplified(
  currentRating: number,
  rank: number,
  opponents: number,
): number {
  // Simplified rating change based on performance
  const expectedRank = opponents / 2;
  const performance = expectedRank - rank;
  const kFactor = 32;
  return currentRating + performance * kFactor;
}

/**
 * Generate test clerk ID
 */
export function generateTestClerkId(index: number): string {
  return `test_clerk_user_${String(index).padStart(3, '0')}`;
}

/**
 * Point calculation for bets
 */
export function calculateBetPoints(
  isCorrect: boolean,
  odds: number,
  hasBoost: boolean,
): number {
  if (!isCorrect) return 0;
  const basePoints = odds * 100; // Base points from odds
  return hasBoost ? basePoints * 1.5 : basePoints;
}

export { faker };
