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
        // Note: recentPositions and formFactor are preserved
      })
      .execute();
    this.logger.log('Soft reset (75/25) monthly stats for all competitors');
  }

  /**
   * Update form after a race for a competitor
   * - Adds new position to recentPositions (keeps last 5)
   * - Recalculates formFactor based on weighted positions
   *
   * @param competitorId - Competitor UUID
   * @param newPosition - Position in the new race (1-12)
   */
  async updateFormAfterRace(
    competitorId: string,
    newPosition: number,
  ): Promise<void> {
    const competitor = await this.repository.findOne({
      where: { id: competitorId },
    });

    if (!competitor) {
      this.logger.warn(
        `Competitor ${competitorId} not found for form update`,
      );
      return;
    }

    // Update recent positions (prepend new position, keep max 5)
    const currentPositions = competitor.recentPositions ?? [];
    const newPositions = [newPosition, ...currentPositions].slice(0, 5);

    // Calculate new form factor using weighted formula
    const formFactor = this.calculateFormFactor(newPositions);

    await this.repository.update(competitorId, {
      recentPositions: newPositions,
      formFactor,
    });

    this.logger.log(
      `Updated form for competitor ${competitorId}: positions=${newPositions.join(',')}, formFactor=${formFactor.toFixed(2)}`,
    );
  }

  /**
   * Calculate form factor from recent positions
   *
   * Uses weighted formula where more recent races have higher impact:
   * - Weights: [0.35, 0.25, 0.20, 0.12, 0.08] for positions 1-5
   * - Score = sum((13 - position) * weight)
   * - formFactor = 0.7 + (score / 12) * 0.6
   * - Range: [0.7, 1.3]
   *
   * @param positions - Array of recent positions (most recent first)
   * @returns Form factor between 0.7 and 1.3
   */
  private calculateFormFactor(positions: number[]): number {
    if (positions.length === 0) {
      return 1.0; // Neutral form if no history
    }

    const weights = [0.35, 0.25, 0.2, 0.12, 0.08];
    let weightedScore = 0;
    let totalWeight = 0;

    for (let i = 0; i < Math.min(positions.length, 5); i++) {
      const position = positions[i];
      const weight = weights[i];
      // 13 - position: rank 1 = 12 points, rank 12 = 1 point
      weightedScore += (13 - position) * weight;
      totalWeight += weight;
    }

    // Normalize if we have fewer than 5 positions
    if (totalWeight > 0 && totalWeight < 1) {
      weightedScore = weightedScore / totalWeight;
    }

    // Convert to form factor: 0.7 + (score/12) * 0.6
    // Max score = 12 (all 1st places) → formFactor = 1.3
    // Min score = 1 (all 12th places) → formFactor ≈ 0.75
    const formFactor = 0.7 + (weightedScore / 12) * 0.6;

    // Clamp to [0.7, 1.3]
    return Math.max(0.7, Math.min(1.3, formFactor));
  }

  /**
   * Batch update form for multiple competitors after a race
   *
   * @param raceResults - Array of race results with competitorId and rank12
   */
  async updateFormForRaceResults(
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
        const newPositions = [result.rank12, ...currentPositions].slice(0, 5);
        const formFactor = this.calculateFormFactor(newPositions);

        competitor.recentPositions = newPositions;
        competitor.formFactor = formFactor;
        await em.save(competitor);
      }
    });

    this.logger.log(
      `Updated form for ${raceResults.length} competitors after race`,
    );
  }

  /**
   * Snapshot daily ranks for all competitors.
   * Called by cron Mon-Fri at midnight.
   *
   * Calculates current rank based on conservativeScore (rating - 2*rd)
   * and stores it in previousDayRank for trend calculation.
   */
  async snapshotDailyRanks(): Promise<void> {
    // Get all competitors with at least one race, sorted by conservativeScore
    const competitors = await this.repository.find({
      order: {},
    });

    // Calculate conservative scores and sort
    const scoredCompetitors = competitors
      .filter((c) => c.raceCount > 0)
      .map((c) => ({
        id: c.id,
        conservativeScore: c.rating - 2 * c.rd,
      }))
      .sort((a, b) => b.conservativeScore - a.conservativeScore);

    // Update previousDayRank for each competitor (1-indexed)
    await this.repository.manager.transaction(async (em) => {
      for (let i = 0; i < scoredCompetitors.length; i++) {
        await em.update(Competitor, scoredCompetitors[i].id, {
          previousDayRank: i + 1,
        });
      }
    });

    this.logger.log(
      `Snapshotted daily ranks for ${scoredCompetitors.length} competitors`,
    );
  }
}
