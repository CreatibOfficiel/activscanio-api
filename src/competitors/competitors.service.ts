import { Injectable } from '@nestjs/common';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { RaceResult } from '../races/race-result.entity';
import { sanitizeCompetitor } from './utils/sanitize-competitor';
import { CompetitorRepository } from './repositories/competitor.repository';
import { CompetitorMonthlyStatsRepository } from '../betting/repositories/competitor-monthly-stats.repository';
import { RatingCalculationService } from '../rating/rating-calculation.service';
import {
  CompetitorNotFoundException,
  EntityNotFoundException,
  ValidationException,
} from '../common/exceptions';

export interface EloHistoryPoint {
  date: string;
  rating: number;
  rd: number;
  raceCount: number;
}

@Injectable()
export class CompetitorsService {
  constructor(
    private competitorRepository: CompetitorRepository,
    private competitorMonthlyStatsRepository: CompetitorMonthlyStatsRepository,
    private ratingCalculationService: RatingCalculationService,
  ) {}

  /* ░░░░░░░░░░░░   READ   ░░░░░░░░░░░░ */

  findAll(): Promise<Competitor[]> {
    return this.competitorRepository.findAllWithCharacterVariants();
  }

  async findOne(id: string): Promise<Competitor | null> {
    return this.competitorRepository.findOne(id, [
      'characterVariant',
      'characterVariant.baseCharacter',
    ]);
  }

  /* ░░░░░░░░░░░░   CREATE   ░░░░░░░░░░░░ */

  async create(dto: CreateCompetitorDto): Promise<Competitor> {
    const competitor = this.competitorRepository.create(dto);
    return this.competitorRepository.save(competitor);
  }

  /* ░░░░░░░░░░░░   UPDATE   ░░░░░░░░░░░░ */

  async update(id: string, dto: UpdateCompetitorDto): Promise<Competitor> {
    return this.competitorRepository.repository.manager.transaction(
      async (em) => {
        const competitor = await em.findOne(Competitor, {
          where: { id },
          relations: ['characterVariant', 'characterVariant.baseCharacter'],
        });
        if (!competitor) throw new CompetitorNotFoundException(id);

        // Separate characterVariantId from simple fields
        const { characterVariantId, ...simpleFields } = dto;
        Object.assign(competitor, simpleFields);

        // Handle characterVariantId, only if present in the payload
        // eslint-disable-next-line no-prototype-builtins
        if (dto.hasOwnProperty('characterVariantId')) {
          if (characterVariantId) {
            // We want to link
            const variant = await em.findOne(CharacterVariant, {
              where: { id: characterVariantId },
              relations: ['competitor', 'baseCharacter'],
            });
            if (!variant)
              throw new EntityNotFoundException(
                'CharacterVariant',
                characterVariantId,
              );
            if (variant.competitor && variant.competitor.id !== competitor.id) {
              throw new ValidationException(
                'characterVariantId',
                `Already linked to competitor ${variant.competitor.id}`,
              );
            }
            variant.competitor = competitor;
            competitor.characterVariant = variant;
            await em.save(variant);
          } else {
            // We want to unlink
            competitor.characterVariant = null;
          }
        }

        return em.save(competitor);
      },
    );
  }

  async updateRatingsForRace(raceResults: RaceResult[]) {
    // Get competitors
    const ids = raceResults.map((r) => r.competitorId);
    const competitors = await this.competitorRepository.findByIds(ids);

    // Calculate updated ratings using Glicko-2
    const updatedRatings =
      this.ratingCalculationService.calculateRatingsForRace(
        competitors,
        raceResults,
      );

    // Use repository method to update all ratings in a transaction
    await this.competitorRepository.updateManyRatings(
      competitors,
      updatedRatings,
      raceResults,
    );

    // Refresh competitors after update
    const updatedCompetitors = await this.competitorRepository.findByIds(ids);

    // Return sanitized competitors
    return updatedCompetitors.map(sanitizeCompetitor);
  }

  /* ░░░░░░░░░░░░   HELPERS link / unlink   ░░░░░░░░░░░░ */

  linkCharacterVariant(competitorId: string, variantId: string) {
    return this.update(competitorId, { characterVariantId: variantId });
  }

  unlinkCharacterVariant(competitorId: string) {
    return this.update(competitorId, { characterVariantId: null });
  }

  /**
   * Mark competitor as active this week (for betting eligibility)
   * This should be called after each race creation
   */
  async markAsActiveThisWeek(competitorId: string): Promise<void> {
    await this.competitorRepository.markAsActiveThisWeek(competitorId);
  }

  /**
   * Reset weekly activity flags (called every Monday by cron)
   */
  async resetWeeklyActivity(): Promise<void> {
    await this.competitorRepository.resetWeeklyActivity();
  }

  /**
   * Reset monthly stats (called 1st of each month by cron)
   */
  async resetMonthlyStats(): Promise<void> {
    await this.competitorRepository.resetMonthlyStats();
  }

  /**
   * Update play streak for a competitor after a race
   */
  async updatePlayStreak(
    competitorId: string,
    raceDate: Date,
  ): Promise<void> {
    await this.competitorRepository.updatePlayStreak(competitorId, raceDate);
  }

  /**
   * Update recent positions for all competitors in a race
   * Called after each race creation
   *
   * @param raceResults - Array of race results with competitorId and rank12
   */
  async updateRecentPositions(
    raceResults: { competitorId: string; rank12: number }[],
  ): Promise<void> {
    await this.competitorRepository.updateRecentPositions(raceResults);
  }

  /**
   * Get ELO history for a competitor from monthly snapshots
   * Includes current rating as the latest point
   */
  async getEloHistory(
    competitorId: string,
    days?: number,
  ): Promise<EloHistoryPoint[]> {
    const competitor = await this.competitorRepository.findOne(competitorId);
    if (!competitor) {
      throw new CompetitorNotFoundException(competitorId);
    }

    // Get all monthly snapshots, ordered ASC
    const monthlyStats =
      await this.competitorMonthlyStatsRepository.findByCompetitor(
        competitorId,
      );

    // findByCompetitor returns DESC order, reverse to get ASC
    monthlyStats.reverse();

    // Filter by period if `days` is provided
    let filtered = monthlyStats;
    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = monthlyStats.filter((s) => {
        const snapshotDate = new Date(s.year, s.month - 1, 1);
        return snapshotDate >= cutoff;
      });
    }

    // Map to EloHistoryPoint
    const history: EloHistoryPoint[] = filtered.map((s) => ({
      date: new Date(s.year, s.month - 1, 1).toISOString(),
      rating: s.finalRating,
      rd: s.finalRd,
      raceCount: s.raceCount,
    }));

    // Add current point (today)
    history.push({
      date: new Date().toISOString(),
      rating: competitor.rating,
      rd: competitor.rd,
      raceCount: competitor.raceCount,
    });

    return history;
  }
}
