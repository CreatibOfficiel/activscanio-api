import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Competitor } from '../competitor.entity';
import { BaseRepository } from '../../common/repositories/base.repository';
import { RaceResult } from '../../races/race-result.entity';

/**
 * Competitor repository with domain-specific queries
 *
 * Gestion de l'État des Compétiteurs:
 * - markAsActiveThisWeek: Appelé après la création d'une course
 * - resetWeeklyActivity: Appelé par cron tous les lundis
 * - resetMonthlyStats: Appelé par cron le 1er du mois
 */
@Injectable()
export class CompetitorRepository extends BaseRepository<Competitor> {
  constructor(
    @InjectRepository(Competitor)
    repository: Repository<Competitor>,
  ) {
    super(repository, 'Competitor');
  }

  /**
   * Find all competitors with their character variants loaded
   */
  async findAllWithCharacterVariants(): Promise<Competitor[]> {
    return this.repository.find({
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /**
   * Find competitors who are active this week (for betting eligibility)
   */
  async findActiveThisWeek(): Promise<Competitor[]> {
    return this.repository.find({
      where: { isActiveThisWeek: true },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /**
   * Find competitors by array of IDs
   * @param ids - Array of competitor UUIDs
   */
  async findByIds(ids: string[]): Promise<Competitor[]> {
    return this.repository.find({
      where: { id: In(ids) },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /**
   * Find a competitor with all relations loaded
   * @param id - Competitor UUID
   */
  async findOneWithRelations(id: string): Promise<Competitor | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /**
   * Update ratings for a single competitor
   * @param competitorId - Competitor UUID
   * @param ratings - New rating, rd, and vol values
   */
  async updateRatings(
    competitorId: string,
    ratings: { rating: number; rd: number; vol: number },
  ): Promise<void> {
    await this.repository.update(competitorId, ratings);
    this.logger.log(`Updated ratings for competitor ${competitorId}`);
  }

  /**
   * Update ratings for multiple competitors after a race
   * This includes rating, rd, vol, raceCount, avgRank12, lastRaceDate, and conservativeScore
   *
   * @param competitors - Competitors to update
   * @param updatedRatings - Map of competitor ID to new ratings
   * @param raceResults - Race results for calculating averages
   */
  async updateManyRatings(
    competitors: Competitor[],
    updatedRatings: Map<string, { rating: number; rd: number; vol: number }>,
    raceResults: RaceResult[],
  ): Promise<void> {
    await this.repository.manager.transaction(async (em) => {
      for (const c of competitors) {
        const ratings = updatedRatings.get(c.id)!;
        const result = raceResults.find((r) => r.competitorId === c.id)!;

        Object.assign(c, {
          rating: ratings.rating,
          rd: ratings.rd,
          vol: ratings.vol,
          conservativeScore: ratings.rating - 2 * ratings.rd,
          raceCount: c.raceCount + 1,
          lastRaceDate: new Date(),
          avgRank12:
            c.avgRank12 + (result.rank12 - c.avgRank12) / (c.raceCount + 1),
          lifetimeAvgRank:
            c.lifetimeAvgRank +
            (result.rank12 - c.lifetimeAvgRank) / (c.totalLifetimeRaces + 1),
        });
        await em.save(c);
      }
    });

    this.logger.log(`Updated ratings for ${competitors.length} competitors`);
  }

  /**
   * Mark competitor as active this week (for betting eligibility)
   * Also increments the current month race count and totalLifetimeRaces
   *
   * @param competitorId - Competitor UUID
   */
  async markAsActiveThisWeek(competitorId: string): Promise<void> {
    await this.repository.update(competitorId, {
      isActiveThisWeek: true,
      currentMonthRaceCount: () => '"currentMonthRaceCount" + 1',
      totalLifetimeRaces: () => '"totalLifetimeRaces" + 1',
    });
  }

  /**
   * Reset weekly activity flags for all competitors
   * Called by cron every Monday
   */
  async resetWeeklyActivity(): Promise<void> {
    await this.repository.update({}, { isActiveThisWeek: false });
    this.logger.log('Reset weekly activity for all competitors');
  }

  /**
   * Reset monthly stats for all competitors using soft reset (75/25)
   * Called by cron on the 1st of each month
   *
   * Soft reset formula:
   * - rating = 0.75 × oldRating + 0.25 × 1500
   * - rd = min(oldRd + 50, 350)
   * - vol, raceCount, currentMonthRaceCount, winStreak, avgRank12 reset to defaults
   * - totalLifetimeRaces is NEVER reset (tracks all-time races)
   * - recentPositions and formFactor are preserved (based on actual race history)
   */
  async resetMonthlyStats(): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(Competitor)
      .set({
        rating: () => '0.75 * "rating" + 0.25 * 1500',
        rd: () => 'LEAST("rd" + 50, 350)',
        vol: 0.06,
        raceCount: 0,
        currentMonthRaceCount: 0,
        winStreak: 0,
        avgRank12: 0,
        // Note: totalLifetimeRaces is intentionally NOT reset
        // Note: recentPositions is preserved (based on actual race history)
      })
      .execute();
    this.logger.log('Soft reset (75/25) monthly stats for all competitors');
  }

  /**
   * Batch update recent positions for multiple competitors after a race.
   * Prepends new position and keeps last 5.
   *
   * @param raceResults - Array of race results with competitorId and rank12
   */
  async updateRecentPositions(
    raceResults: { competitorId: string; rank12: number }[],
  ): Promise<void> {
    await this.repository.manager.transaction(async (em) => {
      for (const result of raceResults) {
        const competitor = await em.findOne(Competitor, {
          where: { id: result.competitorId },
        });

        if (!competitor) {
          continue;
        }

        const currentPositions = competitor.recentPositions ?? [];
        competitor.recentPositions = [result.rank12, ...currentPositions].slice(
          0,
          5,
        );
        await em.save(competitor);
      }
    });

    this.logger.log(
      `Updated recent positions for ${raceResults.length} competitors after race`,
    );
  }

  /**
   * Snapshot daily ranks for all confirmed competitors.
   * Called by cron daily at midnight.
   *
   * Calculates current rank based on conservativeScore (rating - 2*rd)
   * and stores it in previousDayRank for trend calculation.
   */
  async snapshotDailyRanks(): Promise<void> {
    // Get all competitors with at least one race, sorted by conservativeScore
    const competitors = await this.repository.find({
      order: {},
    });

    // Calculate conservative scores and sort (confirmed only: same criteria as sanitize-competitor.ts)
    const scoredCompetitors = competitors
      .filter((c) => c.raceCount >= 5 && c.rd <= 150)
      .map((c) => ({
        id: c.id,
        conservativeScore: c.rating - 2 * c.rd,
      }))
      .sort((a, b) => b.conservativeScore - a.conservativeScore);

    const confirmedIds = scoredCompetitors.map((c) => c.id);

    // Update previousDayRank for each confirmed competitor (1-indexed)
    // and clear previousDayRank for non-confirmed competitors
    await this.repository.manager.transaction(async (em) => {
      for (let i = 0; i < scoredCompetitors.length; i++) {
        await em.update(Competitor, scoredCompetitors[i].id, {
          previousDayRank: i + 1,
        });
      }

      // Clear previousDayRank for non-confirmed competitors so they don't
      // leave stale rank data that skews trend calculations
      const nonConfirmed = competitors.filter(
        (c) => !confirmedIds.includes(c.id),
      );
      for (const c of nonConfirmed) {
        if (c.previousDayRank !== null) {
          await em.update(Competitor, c.id, { previousDayRank: null });
        }
      }
    });

    this.logger.log(
      `Snapshotted daily ranks for ${scoredCompetitors.length} competitors (cleared ${competitors.length - confirmedIds.length} non-confirmed)`,
    );
  }

  /**
   * Update play streak for a competitor after a race.
   *
   * Rules:
   * - Only weekdays (Mon-Fri) count
   * - 1 missed weekday is tolerated (grace)
   * - 2+ missed weekdays resets the streak
   *
   * @param competitorId - Competitor UUID
   * @param raceDate - Date of the race
   */
  async updatePlayStreak(
    competitorId: string,
    raceDate: Date,
  ): Promise<void> {
    const competitor = await this.repository.findOne({
      where: { id: competitorId },
    });

    if (!competitor) return;

    let { playStreak, bestPlayStreak } = competitor;

    if (!competitor.lastRaceDate) {
      playStreak = 1;
    } else {
      const businessDays = this.businessDaysBetween(
        competitor.lastRaceDate,
        raceDate,
      );

      if (businessDays === 0) {
        // Same business day — no change
        return;
      } else if (businessDays <= 2) {
        // Consecutive day (1) or 1-day grace (2)
        playStreak += 1;
      } else {
        // 2+ missed weekdays — streak broken
        playStreak = 1;
      }
    }

    bestPlayStreak = Math.max(bestPlayStreak, playStreak);

    await this.repository.update(competitorId, {
      playStreak,
      bestPlayStreak,
    });
  }

  /**
   * Count the number of business days (Mon-Fri) between two dates (date-only, ignoring time).
   * Returns 0 if both dates fall on the same business day.
   */
  private businessDaysBetween(d1: Date, d2: Date): number {
    const start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

    if (start >= end) return 0;

    let count = 0;
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1); // start from the day after d1

    while (cursor <= end) {
      const day = cursor.getDay(); // 0=Sun, 6=Sat
      if (day !== 0 && day !== 6) {
        count++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return count;
  }
}
