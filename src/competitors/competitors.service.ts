import { Injectable } from '@nestjs/common';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { RaceResult } from '../races/race-result.entity';
import { sanitizeCompetitor } from './utils/sanitize-competitor';
import { CompetitorRepository } from './repositories/competitor.repository';
import { CompetitorEloSnapshotRepository } from './repositories/competitor-elo-snapshot.repository';
import { RaceResultRepository } from '../races/repositories/race-result.repository';
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
    private competitorEloSnapshotRepository: CompetitorEloSnapshotRepository,
    private raceResultRepository: RaceResultRepository,
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

    // Compute and persist rating deltas BEFORE updateManyRatings mutates competitors
    for (const result of raceResults) {
      const competitor = competitors.find((c) => c.id === result.competitorId);
      const newRatings = updatedRatings.get(result.competitorId);
      if (competitor && newRatings) {
        const oldConservative = competitor.rating - 2 * competitor.rd;
        const newConservative = newRatings.rating - 2 * newRatings.rd;
        result.ratingDelta = newConservative - oldConservative;
      }
    }
    await this.raceResultRepository.saveMany(raceResults);

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
   * Update win streak for a competitor after a race
   */
  async updateWinStreak(
    competitorId: string,
    rank12: number,
  ): Promise<void> {
    await this.competitorRepository.updateWinStreak(competitorId, rank12);
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
   * Get ELO history for a competitor from daily snapshots.
   * Always appends a live point for today if not already the last snapshot.
   */
  async getEloHistory(
    competitorId: string,
    days?: number,
  ): Promise<EloHistoryPoint[]> {
    const competitor = await this.competitorRepository.findOne(competitorId);
    if (!competitor) {
      throw new CompetitorNotFoundException(competitorId);
    }

    const sinceDate = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined;

    const snapshots =
      await this.competitorEloSnapshotRepository.findByCompetitor(
        competitorId,
        sinceDate,
      );

    const history: EloHistoryPoint[] = snapshots.map((s) => ({
      date: new Date(s.date).toISOString(),
      rating: s.rating,
      rd: s.rd,
      raceCount: s.raceCount,
    }));

    // Append live point for today if not already present as last snapshot
    const today = new Date().toISOString().split('T')[0];
    const lastDate =
      snapshots.length > 0 ? String(snapshots[snapshots.length - 1].date) : '';
    if (lastDate !== today) {
      history.push({
        date: new Date().toISOString(),
        rating: competitor.rating,
        rd: competitor.rd,
        raceCount: competitor.raceCount,
      });
    }

    return history;
  }
}
