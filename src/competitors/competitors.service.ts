import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  /**
   * Find all competitors.
   */
  findAll(): Promise<Competitor[]> {
    return this.competitorsRepo.find();
  }

  /**
   * Find a single competitor by its ID.
   */
  findOne(id: string): Promise<Competitor | null> {
    return this.competitorsRepo.findOne({ where: { id } });
  }

  /**
   * Create a new competitor. If a characterVariantId is provided, attempt to link the character variant
   * to this competitor. If that variant is currently linked to another competitor, we unlink it first,
   * then attach it to the new competitor. This entire operation is wrapped in a transaction for safety.
   */
  async create(dto: CreateCompetitorDto): Promise<Competitor> {
    // We wrap our logic in a TypeORM transaction to ensure data consistency in case something goes wrong.
    return this.competitorsRepo.manager.transaction(
      async (transactionalEntityManager) => {
        // Create a new Competitor instance from the provided DTO
        const competitor = this.competitorsRepo.create(dto);

        // If a characterVariantId is present, find the corresponding variant
        if (dto.characterVariantId) {
          const variant = await transactionalEntityManager.findOne(
            CharacterVariant,
            {
              where: { id: dto.characterVariantId },
              relations: ['competitor'],
            },
          );
          if (!variant) {
            // If the variant doesn't exist, we throw a NotFoundException
            throw new NotFoundException('CharacterVariant not found');
          }

          // If the variant is already linked to another competitor, we unlink it
          if (variant.competitor) {
            variant.competitor.characterVariant = null;
            await transactionalEntityManager.save(variant.competitor);
          }

          // Finally, we link the variant to our new competitor
          competitor.characterVariant = variant;
        }

        // Save the new competitor in the transaction
        return transactionalEntityManager.save(competitor);
      },
    );
  }

  /**
   * Update an existing competitor. Optionally re-link or remove the competitor's associated character variant
   * according to the new DTO. This also uses a transaction to handle the unlinking and re-linking safely.
   */
  async update(id: string, dto: UpdateCompetitorDto): Promise<Competitor> {
    // We wrap our logic in a TypeORM transaction to ensure data consistency
    return this.competitorsRepo.manager.transaction(
      async (transactionalEntityManager) => {
        // Find the existing competitor with its (potentially) linked characterVariant
        const competitor = await transactionalEntityManager.findOne(
          Competitor,
          {
            where: { id },
            relations: ['characterVariant'],
          },
        );
        if (!competitor) {
          throw new NotFoundException('Competitor not found');
        }

        // Merge the DTO fields into the competitor
        Object.assign(competitor, dto);

        if (dto.characterVariantId) {
          // If a new characterVariantId is provided, find the variant
          const variant = await transactionalEntityManager.findOne(
            CharacterVariant,
            {
              where: { id: dto.characterVariantId },
              relations: ['competitor'],
            },
          );
          if (!variant) {
            throw new NotFoundException('CharacterVariant not found');
          }

          // If the variant is linked to another competitor, unlink it
          if (variant.competitor && variant.competitor.id !== competitor.id) {
            variant.competitor.characterVariant = null;
            await transactionalEntityManager.save(variant.competitor);
          }
          // Link this variant to our updated competitor
          competitor.characterVariant = variant;
        } else {
          // If no characterVariantId is provided, we can remove the current characterVariant link
          competitor.characterVariant = null;
        }

        // Save the competitor in the transaction
        return transactionalEntityManager.save(competitor);
      },
    );
  }

  /**
   * Recompute global ranks for all competitors. Uses a "temporary skill" computation that includes
   * an exponential inactivity penalty if the competitor has been inactive for more than 7 days.
   *
   * Steps:
   * 1) Compute an "inactiveSkill" for each competitor: baseSkill = mu - 3*sigma, adjusted by a daily penalty after 7 days.
   * 2) Filter out competitors who have never played (raceCount=0) so they won't appear in the sorted ranking.
   * 3) Sort the active competitors by:
   *    - inactiveSkill (descending),
   *    - avgRank12 (ascending),
   *    - raceCount (descending),
   *    - and a special top-3 tie-break if necessary.
   * 4) Assign ranks with allowance for ties if all tie-break criteria are equal.
   * 5) Competitors with zero races keep a rank of 0.
   * 6) Save any updated ranks to the database.
   */
  async recomputeGlobalRank(): Promise<void> {
    const now = new Date();
    const allCompetitors = await this.competitorsRepo.find();

    // 1) Compute a "temporary skill" for each competitor,
    //    including an inactivity penalty if inactive > 7 days.
    for (const c of allCompetitors) {
      if (c.raceCount > 0 && c.lastRaceDate) {
        // Compute base TrueSkill measure (mu - 3*sigma)
        const baseSkill = c.mu - 3 * c.sigma;

        // Calculate days since last race
        const diffDays = Math.floor(
          (now.getTime() - c.lastRaceDate.getTime()) / (1000 * 3600 * 24),
        );

        // If inactive for more than 7 days, apply a daily penalty of 2% starting day 8
        if (diffDays > 7) {
          const penaltyDays = diffDays - 7;
          const dailyFactor = 0.98; // 2% decay per day
          const adjustedSkill = baseSkill * Math.pow(dailyFactor, penaltyDays);
          c['inactiveSkill'] = adjustedSkill;
        } else {
          // No penalty when diffDays <= 7
          c['inactiveSkill'] = baseSkill;
        }
      } else {
        // If this competitor has never raced (raceCount=0) or lastRaceDate is null
        c['inactiveSkill'] = 0;
      }
    }

    // 2) Filter out competitors who have never raced
    const withGames = allCompetitors.filter((c) => c.raceCount > 0);

    // 3) Sort using the tie-break criteria
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

      // Otherwise, remain tied
      return 0;
    });

    // 4) Assign ranks with tie handling
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
          curr.rank = prev.rank;
        } else {
          curr.rank = currentRank;
        }
      } else {
        // The first competitor in the list has rank=1
        sortedCompetitors[i].rank = currentRank;
      }
      currentRank++;
    }

    // 5) Competitors with zero races => rank=0
    for (const c of allCompetitors) {
      if (c.raceCount === 0) {
        c.rank = 0;
      }
    }

    // 6) Save all changes to the database
    await this.competitorsRepo.save(allCompetitors);
  }

  /**
   * Unlinks the competitor from its current character variant.
   * The character variant will be available again for selection.
   */
  async unlinkCharacterVariant(competitorId: string): Promise<Competitor> {
    return this.competitorsRepo.manager.transaction(
      async (transactionalEntityManager) => {
        // Find the competitor with its character variant
        const competitor = await transactionalEntityManager.findOne(
          Competitor,
          {
            where: { id: competitorId },
            relations: ['characterVariant'],
          },
        );

        if (!competitor) {
          throw new NotFoundException(
            `Competitor with ID ${competitorId} not found`,
          );
        }

        // If the competitor already has a character variant, unlink it
        if (competitor.characterVariant) {
          competitor.characterVariant = null;
          competitor.characterId = '';
          return transactionalEntityManager.save(competitor);
        }

        // Otherwise, simply return the competitor without changes
        return competitor;
      },
    );
  }
}
