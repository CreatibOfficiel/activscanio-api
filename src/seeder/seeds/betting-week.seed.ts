import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import {
  BettingWeek,
  BettingWeekStatus,
} from 'src/betting/entities/betting-week.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import { CompetitorOdds } from 'src/betting/entities/competitor-odds.entity';
import {
  getWeekNumber,
  getWeekStartDate,
  getWeekEndDate,
  subtractWeeks,
  seededRandom,
  calculateSimpleOdds,
} from '../utils/seed-helpers';

const logger = new Logger('BettingWeekSeed');

const TOTAL_WEEKS = 16; // 4 months of weeks

export async function seedBettingWeeks(
  dataSource: DataSource,
): Promise<BettingWeek[]> {
  const bettingWeekRepository = dataSource.getRepository(BettingWeek);
  const competitorRepository = dataSource.getRepository(Competitor);
  const competitorOddsRepository = dataSource.getRepository(CompetitorOdds);

  // Check if we already have betting weeks
  const existingCount = await bettingWeekRepository.count();
  if (existingCount > 0) {
    logger.log('🟡 Betting weeks already exist. Skipping...');
    return bettingWeekRepository.find({ order: { startDate: 'ASC' } });
  }

  const competitors = await competitorRepository.find();
  if (competitors.length === 0) {
    logger.warn('⚠️ No competitors found. Please seed competitors first.');
    return [];
  }

  const now = new Date();
  const weeksToCreate: Partial<BettingWeek>[] = [];

  // Generate weeks going back from current week
  for (let i = 0; i < TOTAL_WEEKS; i++) {
    const weekDate = subtractWeeks(now, i);
    const weekNumber = getWeekNumber(weekDate);
    const year = weekDate.getFullYear();
    const startDate = getWeekStartDate(year, weekNumber);
    const endDate = getWeekEndDate(startDate);

    // Determine status based on position
    let status: BettingWeekStatus;
    let podiumFirst: Competitor | null = null;
    let podiumSecond: Competitor | null = null;
    let podiumThird: Competitor | null = null;
    let finalizedAt: Date | null = null;

    if (i === 0) {
      // Current week - open
      status = BettingWeekStatus.OPEN;
    } else if (i === 1) {
      // Previous week - closed (waiting for results) or finalized
      status = seededRandom.bool(0.3)
        ? BettingWeekStatus.CLOSED
        : BettingWeekStatus.FINALIZED;
    } else {
      // Older weeks - all finalized
      status = BettingWeekStatus.FINALIZED;
    }

    // Generate podium for finalized weeks
    if (status === BettingWeekStatus.FINALIZED) {
      const podiumCompetitors = seededRandom.pickMultiple(competitors, 3);
      podiumFirst = podiumCompetitors[0];
      podiumSecond = podiumCompetitors[1];
      podiumThird = podiumCompetitors[2];
      finalizedAt = new Date(endDate);
      finalizedAt.setDate(finalizedAt.getDate() + 1); // Finalized day after end
    }

    weeksToCreate.push({
      weekNumber,
      year,
      month: startDate.getMonth() + 1,
      startDate,
      endDate,
      status,
      podiumFirstId: podiumFirst?.id ?? undefined,
      podiumSecondId: podiumSecond?.id ?? undefined,
      podiumThirdId: podiumThird?.id ?? undefined,
      finalizedAt: finalizedAt ?? undefined,
    });
  }

  // Insert weeks (reverse order to maintain chronological insert)
  const insertedWeeks = await bettingWeekRepository.save(
    weeksToCreate.reverse(),
  );

  logger.log(`✅ ${insertedWeeks.length} betting weeks seeded successfully!`);

  // Generate competitor odds for each week
  await seedCompetitorOdds(
    dataSource,
    insertedWeeks,
    competitors,
    competitorOddsRepository,
  );

  return bettingWeekRepository.find({ order: { startDate: 'ASC' } });
}

async function seedCompetitorOdds(
  dataSource: DataSource,
  weeks: BettingWeek[],
  competitors: Competitor[],
  competitorOddsRepository: import('typeorm').Repository<CompetitorOdds>,
) {
  const oddsToCreate: Partial<CompetitorOdds>[] = [];

  // Calculate average rating
  const avgRating =
    competitors.reduce((sum, c) => sum + c.rating, 0) / competitors.length;

  for (const week of weeks) {
    for (const competitor of competitors) {
      // Add some randomness to odds while keeping them based on rating
      const baseOdds = calculateSimpleOdds(competitor.rating, avgRating);
      const variation = seededRandom.float(0.9, 1.1);
      const finalOdds = Math.round(baseOdds * variation * 100) / 100;

      oddsToCreate.push({
        competitorId: competitor.id,
        bettingWeekId: week.id,
        oddFirst: Math.max(1.1, Math.min(finalOdds, 20)),
        oddSecond: Math.max(1.1, Math.min(finalOdds * 1.1, 20)),
        oddThird: Math.max(1.1, Math.min(finalOdds * 1.2, 20)),
        calculatedAt: week.startDate,
        metadata: {
          elo: competitor.rating,
          rd: competitor.rd,
          recentWins: seededRandom.int(0, 5),
          winStreak: competitor.winStreak,
          raceCount: competitor.raceCount,
          avgRank: competitor.avgRank12 || 6,
          formFactor: 1.0,
          probability: 1 / finalOdds,
        },
      });
    }
  }

  // Insert in batches for performance
  const batchSize = 100;
  for (let i = 0; i < oddsToCreate.length; i += batchSize) {
    const batch = oddsToCreate.slice(i, i + batchSize);
    await competitorOddsRepository.insert(batch);
  }

  logger.log(`✅ ${oddsToCreate.length} competitor odds seeded successfully!`);
}
