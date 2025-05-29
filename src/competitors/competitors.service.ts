import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { Glicko2Service } from './glicko2.service';

@Injectable()
export class CompetitorsService {
  constructor(
    @InjectRepository(Competitor)
    private competitorsRepo: Repository<Competitor>,
    private glicko2Service: Glicko2Service,
  ) {}

  /* ░░░░░░░░░░░░   READ   ░░░░░░░░░░░░ */

  findAll(): Promise<Competitor[]> {
    return this.competitorsRepo.find({
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  async findOne(id: string): Promise<Competitor | null> {
    return this.competitorsRepo.findOne({
      where: { id },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /* ░░░░░░░░░░░░   CREATE   ░░░░░░░░░░░░ */

  async create(dto: CreateCompetitorDto): Promise<Competitor> {
    return this.competitorsRepo.manager.transaction(async (em) => {
      const competitor = this.competitorsRepo.create(dto);
      return em.save(competitor);
    });
  }

  /* ░░░░░░░░░░░░   UPDATE   ░░░░░░░░░░░░ */

  async update(id: string, dto: UpdateCompetitorDto): Promise<Competitor> {
    return this.competitorsRepo.manager.transaction(async (em) => {
      const competitor = await em.findOne(Competitor, {
        where: { id },
        relations: ['characterVariant', 'characterVariant.baseCharacter'],
      });
      if (!competitor) throw new NotFoundException('Competitor not found');

      // Separate characterVariantId from simple fields
      const { characterVariantId, ...simpleFields } = dto;
      Object.assign(competitor, simpleFields);

      // Handle characterVariantId, only if present in the payload
      if (dto.hasOwnProperty('characterVariantId')) {
        if (characterVariantId) {
          // We want to link
          const variant = await em.findOne(CharacterVariant, {
            where: { id: characterVariantId },
            relations: ['competitor', 'baseCharacter'],
          });
          if (!variant)
            throw new NotFoundException('CharacterVariant not found');
          if (variant.competitor && variant.competitor.id !== competitor.id) {
            throw new BadRequestException(
              `CharacterVariant already linked to competitor ${variant.competitor.id}`,
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
    });
  }

  async updateRatings(
    competitorId: string,
    opponents: { id: string; score: number }[],
  ): Promise<Competitor> {
    try {
      if (!competitorId || !opponents || !Array.isArray(opponents)) {
        throw new BadRequestException('Invalid parameters');
      }

      return await this.competitorsRepo.manager.transaction(async (em) => {
        const competitor = await em.findOne(Competitor, {
          where: { id: competitorId },
        });
        if (!competitor) throw new NotFoundException('Competitor not found');

        const opponentIds = opponents.map(o => o.id);
        const opponentEntities = await em.find(Competitor, {
          where: { id: In(opponentIds) },
        });

        if (opponentEntities.length !== opponents.length) {
          throw new BadRequestException('Some opponents were not found');
        }

        try {
          const newRating = this.glicko2Service.calculateNewRating(
            competitor,
            opponentEntities,
            opponents.map(o => o.score),
          );

          Object.assign(competitor, newRating);
          return await em.save(competitor);
        } catch (error) {
          console.error('Error calculating new rating:', error);
          throw new BadRequestException('Error calculating new rating: ' + error.message);
        }
      });
    } catch (error) {
      console.error('Error in updateRatings:', error);
      throw error;
    }
  }

  /* ░░░░░░░░░░░░   HELPERS link / unlink   ░░░░░░░░░░░░ */

  linkCharacterVariant(competitorId: string, variantId: string) {
    return this.update(competitorId, { characterVariantId: variantId });
  }

  unlinkCharacterVariant(competitorId: string) {
    return this.update(competitorId, { characterVariantId: null });
  }
}
