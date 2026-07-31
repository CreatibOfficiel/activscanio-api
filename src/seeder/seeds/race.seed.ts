import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { RaceEvent } from 'src/races/race-event.entity';
import { RaceResult } from 'src/races/race-result.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import { seededRandom, getScoreForRank, addDays } from '../utils/seed-helpers';

const logger = new Logger('RaceSeed');

const PLAYERS_PER_RACE = 4; // 4 players per race (as in Mario Kart 4-player mode)

export async function seedRaces(dataSource: DataSource): Promise<RaceEvent[]> {
  const raceRepository = dataSource.getRepository(RaceEvent);
  const raceResultRepository = dataSource.getRepository(RaceResult);
  const competitorRepository = dataSource.getRepository(Competitor);

  // Check if we already have races
  const existingCount = await raceRepository.count();
  if (existingCount > 0) {
    logger.log('🟡 Races already exist. Skipping...');
    return raceRepository.find({ relations: ['results'] });
  }

  const competitors = await competitorRepository.find();
  // Eight recent weeks, Monday-anchored, replacing the old betting weeks.
  const bettingWeeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date();
    start.setDate(start.getDate() - (7 - i) * 7);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, isCurrent: i === 7 };
  });

  if (competitors.length === 0) {
    logger.warn('⚠️ No competitors found. Please seed competitors first.');
    return [];
  }

  const racesToCreate: RaceEvent[] = [];
  const resultsToCreate: RaceResult[] = [];

  // Track competitor stats for updating
  const competitorStats = new Map<
    string,
    {
      raceCount: number;
      totalRank: number;
      rating: number;
      lastRaceDate: Date | null;
      winStreak: number;
    }
  >();

  // Initialize stats from current competitor data
  for (const competitor of competitors) {
    competitorStats.set(competitor.id, {
      raceCount: 0,
      totalRank: 0,
      rating: competitor.rating,
      lastRaceDate: null,
      winStreak: 0,
    });
  }

  // Generate races for each betting week
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today

  for (const week of bettingWeeks) {
    const isOpenWeek = week.isCurrent;

    // For open weeks, generate fewer races (2-4) only for past days
    // For closed weeks, generate 3-7 races
    const numRaces = isOpenWeek
      ? seededRandom.int(2, 4)
      : seededRandom.int(3, 7);

    // Calculate max days for race generation
    let maxDayOffset: number;
    if (isOpenWeek) {
      // For open week: only generate races for days that have passed
      const weekStart = new Date(week.startDate);
      const daysSinceWeekStart = Math.floor(
        (today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      maxDayOffset = Math.max(0, Math.min(daysSinceWeekStart - 1, 6)); // At least 1 day ago, max 6

      // Skip if week just started (no past days yet)
      if (maxDayOffset < 0) continue;
    } else {
      maxDayOffset = 6; // Full week for closed weeks
    }

    for (let r = 0; r < numRaces; r++) {
      // Random date within the allowed range
      const raceDate = addDays(
        new Date(week.startDate),
        seededRandom.int(0, maxDayOffset),
      );
      raceDate.setHours(
        seededRandom.int(18, 22),
        seededRandom.int(0, 59),
        0,
        0,
      );

      // Create race event
      const race = new RaceEvent();
      race.date = raceDate;
      race.month = raceDate.getMonth() + 1;
      race.year = raceDate.getFullYear();

      // Select 4 random participants
      const participants = seededRandom.pickMultiple(
        competitors,
        PLAYERS_PER_RACE,
      );

      // Generate rankings (1-4) based on ratings with some randomness
      const sortedParticipants = [...participants].sort((a, b) => {
        const aRating = competitorStats.get(a.id)?.rating || a.rating;
        const bRating = competitorStats.get(b.id)?.rating || b.rating;
        // Add randomness factor (30% weight)
        const aScore = aRating * 0.7 + seededRandom.float(0, 500) * 0.3;
        const bScore = bRating * 0.7 + seededRandom.float(0, 500) * 0.3;
        return bScore - aScore;
      });

      racesToCreate.push(race);

      // Create results for each participant
      for (let rank = 0; rank < sortedParticipants.length; rank++) {
        const competitor = sortedParticipants[rank];
        const actualRank = rank + 1; // 1-based rank
        const score = getScoreForRank(actualRank);

        const result = new RaceResult();
        result.competitorId = competitor.id;
        result.rank12 = actualRank;
        result.score = score;
        result.race = race;

        resultsToCreate.push(result);

        // Update competitor stats
        const stats = competitorStats.get(competitor.id)!;
        stats.raceCount++;
        stats.totalRank += actualRank;
        stats.lastRaceDate = raceDate;

        // Update win streak
        if (actualRank === 1) {
          stats.winStreak++;
        } else {
          stats.winStreak = 0;
        }

        // Update rating (simplified Glicko-like adjustment)
        const kFactor = 32;
        const expectedRank = PLAYERS_PER_RACE / 2; // Middle rank
        const performance = expectedRank - actualRank;
        stats.rating = Math.max(
          1000,
          Math.min(2500, stats.rating + performance * kFactor),
        );
      }
    }
  }

  // Save races and results
  const savedRaces = await raceRepository.save(racesToCreate);
  await raceResultRepository.save(resultsToCreate);

  logger.log(`✅ ${savedRaces.length} races seeded successfully!`);
  logger.log(`✅ ${resultsToCreate.length} race results seeded successfully!`);

  // Update competitor stats in database
  for (const competitor of competitors) {
    const stats = competitorStats.get(competitor.id)!;
    if (stats.raceCount > 0) {
      await competitorRepository.update(competitor.id, {
        raceCount: stats.raceCount,
        avgRank12: Math.round((stats.totalRank / stats.raceCount) * 100) / 100,
        rating: Math.round(stats.rating * 100) / 100,
        rd: stats.raceCount >= 5 ? 70 : 350,
        lastRaceDate: stats.lastRaceDate,
        winStreak: stats.winStreak,
        currentMonthRaceCount: seededRandom.int(0, stats.raceCount),
        isActiveThisWeek: seededRandom.bool(0.6),
      });
    }
  }

  logger.log('✅ Competitor stats updated successfully!');

  return savedRaces;
}
