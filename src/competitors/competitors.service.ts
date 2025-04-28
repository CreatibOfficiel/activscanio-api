import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';

@Injectable()
export class CompetitorsService {
  constructor(
    @InjectRepository(Competitor)
    private competitorsRepo: Repository<Competitor>,
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

      // Séparer characterVariantId des champs « simples »
      const { characterVariantId, ...simpleFields } = dto;
      Object.assign(competitor, simpleFields);

      // Gestion du lien au CharacterVariant, uniquement si présent dans le payload
      if (dto.hasOwnProperty('characterVariantId')) {
        if (characterVariantId) {
          // On veut lier
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
          // On veut délier
          competitor.characterVariant = null;
        }
      }

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

    // Retrieve all competitors
    const allCompetitors = await this.competitorsRepo.find();

    // Filter those with at least one race and a race in the last 7 days
    const withGames = allCompetitors.filter(
      (c) =>
        c.raceCount > 0 &&
        c.lastRaceDate != null &&
        c.lastRaceDate.getTime() >= oneWeekAgo.getTime(),
    );

    // Sort by avgRank12 (asc), raceCount (desc), then top-3 tie-break
    const sortedCompetitors = [...withGames].sort((a, b) => {
      // 1) best avgRank12
      const avgRankComp = a.avgRank12 - b.avgRank12;
      if (avgRankComp !== 0) return avgRankComp;

      // 2) highest number of races
      const raceCountComp = b.raceCount - a.raceCount;
      if (raceCountComp !== 0) return raceCountComp;

      // 3) priority to the top 3 of the initial list
      const idxA = withGames.indexOf(a);
      const idxB = withGames.indexOf(b);
      if (idxA < 3 && idxB >= 3) return -1;
      if (idxB < 3 && idxA >= 3) return 1;

      return 0; // remain tied
    });

    // Assign ranks with tie handling
    let currentRank = 1;
    for (let i = 0; i < sortedCompetitors.length; i++) {
      const curr = sortedCompetitors[i];

      if (i > 0) {
        const prev = sortedCompetitors[i - 1];
        const sameAvgRank = curr.avgRank12 === prev.avgRank12;
        const sameRaceCount = curr.raceCount === prev.raceCount;

        if (sameAvgRank && sameRaceCount) {
          // same rank as previous
          curr.rank = prev.rank;
        } else {
          curr.rank = currentRank;
        }
      } else {
        // first in the ranking
        curr.rank = currentRank;
      }

      currentRank++;
    }

    // Those who have never raced remain rank = 0
    for (const c of allCompetitors) {
      if (c.raceCount === 0) {
        c.rank = 0;
      }
    }

    // Save updates
    await this.competitorsRepo.save(allCompetitors);
  }
}
