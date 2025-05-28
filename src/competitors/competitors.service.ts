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
    return this.competitorsRepo.manager.transaction(async (em) => {
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

      const newRating = this.glicko2Service.calculateNewRating(
        competitor,
        opponentEntities,
        opponents.map(o => o.score),
      );

      Object.assign(competitor, newRating);
      return em.save(competitor);
    });
  }

  /* ░░░░░░░░░░░░   HELPERS link / unlink   ░░░░░░░░░░░░ */

  linkCharacterVariant(competitorId: string, variantId: string) {
    return this.update(competitorId, { characterVariantId: variantId });
  }

  unlinkCharacterVariant(competitorId: string) {
    return this.update(competitorId, { characterVariantId: null });
  }

  /* ░░░░░░░░░░░░   RANK RECOMPUTE   ░░░░░░░░░░░░ */

  /**
   * Recomputes the global ranks for all competitors. This method filters out competitors who have never participated
   * (raceCount=0) or those who haven't participated in more than a week. It then calculates a "temporary skill" for
   * the remaining competitors, sorts them according to several tie-break criteria, assigns ranks (with tie handling),
   * and saves all changes to the database.
   *
   * Steps:
   * 1) Exclude all competitors with zero races, and those whose last race date was more than seven days ago.
   * 2) Sort the remaining competitors by:
   *    - inactiveSkill (descending),
   *    - avgRank12 (ascending),
   *    - raceCount (descending),
   *    - a special top-3 tie-break if necessary.
   * 3) Assign ranks with tie handling.
   * 4) Competitors with zero races keep a rank of 0.
   * 5) Save any updated ranks to the database.
   */
  async recomputeGlobalRank(): Promise<void> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime());
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const allCompetitors = await this.competitorsRepo.find();

    // We exclude competitors who have never participated (raceCount=0)
    // AND those who haven't participated for more than a week
    const withGames = allCompetitors.filter((c) => {
      if (c.raceCount === 0) return false;
      // Check the last race date
      return c.lastRaceDate && c.lastRaceDate.getTime() >= oneWeekAgo.getTime();
    });

    // Sort the remaining competitors based on the tie-break criteria
    const sortedCompetitors = [...withGames].sort((a, b) => {
      // Compare inactiveSkill descending
      const skillComp = b['inactiveSkill'] - a['inactiveSkill'];
      if (skillComp !== 0) return skillComp;

      // Compare avgRank12 ascending
      const avgRankComp = a.avgRank12 - b.avgRank12;
      if (avgRankComp !== 0) return avgRankComp;

      // Compare raceCount descending
      const raceCountComp = b.raceCount - a.raceCount;
      if (raceCountComp !== 0) return raceCountComp;

      // Special top-3 tie-break: if one is in the top 3 and the other is not
      const indexA = withGames.indexOf(a);
      const indexB = withGames.indexOf(b);
      if (indexA < 3 && indexB >= 3) return -1;
      if (indexB < 3 && indexA >= 3) return 1;

      // Otherwise remain tied
      return 0;
    });

    // Assign ranks with tie handling
    let currentRank = 1;
    for (let i = 0; i < sortedCompetitors.length; i++) {
      if (i > 0) {
        const prev = sortedCompetitors[i - 1];
        const curr = sortedCompetitors[i];
        // If all criteria are equal, they share the same rank
        if (
          curr['inactiveSkill'] === prev['inactiveSkill'] &&
          curr.avgRank12 === prev.avgRank12 &&
          curr.raceCount === prev.raceCount
        ) {
          sortedCompetitors[i].rank = prev.rank;
        } else {
          sortedCompetitors[i].rank = currentRank;
        }
      } else {
        sortedCompetitors[i].rank = currentRank;
      }
      currentRank++;
    }

    // Save all updated ranks
    await this.competitorsRepo.save(sortedCompetitors);
  }
}
