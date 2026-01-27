import { Injectable } from '@nestjs/common';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { RaceResult } from '../races/race-result.entity';
import { sanitizeCompetitor } from './utils/sanitize-competitor';
import { CompetitorRepository } from './repositories/competitor.repository';
import { RatingCalculationService } from '../rating/rating-calculation.service';
import {
  CompetitorNotFoundException,
  EntityNotFoundException,
  ValidationException,
} from '../common/exceptions';

@Injectable()
export class CompetitorsService {
  constructor(
    private competitorRepository: CompetitorRepository,
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
}
