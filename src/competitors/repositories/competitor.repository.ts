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
            c.avgRank12 +
            (result.rank12 - c.avgRank12) / (c.raceCount + 1),
        });
        await em.save(c);
      }
    });

    this.logger.log(`Updated ratings for ${competitors.length} competitors`);
  }

  /**
   * Mark competitor as active this week (for betting eligibility)
   * Also increments the current month race count
   *
   * @param competitorId - Competitor UUID
   */
  async markAsActiveThisWeek(competitorId: string): Promise<void> {
    await this.repository.update(competitorId, {
      isActiveThisWeek: true,
      currentMonthRaceCount: () => 'current_month_race_count + 1',
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
   * Reset monthly stats for all competitors
   * Called by cron on the 1st of each month
   */
  async resetMonthlyStats(): Promise<void> {
    await this.repository.update(
      {},
      {
        rating: 1500,
        rd: 350,
        vol: 0.06,
        raceCount: 0,
        currentMonthRaceCount: 0,
        winStreak: 0,
        avgRank12: 0,
      },
    );
    this.logger.log('Reset monthly stats for all competitors');
  }
}
