import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { Glicko2, Player } from 'glicko2';
import { In, Repository } from 'typeorm';
import { RaceResult } from '../races/race-result.entity';
import { sanitizeCompetitor } from './utils/sanitize-competitor';

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

  async updateRatingsForRace(raceResults: RaceResult[]) {
    // Get competitors
    const ids = raceResults.map(r => r.competitorId);
    const competitors = await this.competitorsRepo.findBy({ id: In(ids) });

    // Initialize Glicko-2
    const g2 = new Glicko2({ tau: 0.5, rating: 1500, rd: 350, vol: 0.06 });

    // Create players
    const players = new Map<string, Player>();
    competitors.forEach(c =>
      players.set(c.id, g2.makePlayer(c.rating, c.rd, c.vol)),
    );

    // Create all pairs (scores 1 / 0 / 0.5)
    const ranked = raceResults
      .map(r => ({ ...r, player: players.get(r.competitorId)! }))
      .sort((a, b) => a.rank12 - b.rank12);

    const matches: [Player, Player, number][] = [];
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        const score = ranked[i].rank12 === ranked[j].rank12 ? 0.5 : 1;
        matches.push([ranked[i].player, ranked[j].player, score]);
      }
    }

    // Update ratings
    g2.updateRatings(matches);

    // Persist in a transaction
    await this.competitorsRepo.manager.transaction(async em => {
      for (const c of competitors) {
        const p = players.get(c.id)!;
        Object.assign(c, {
          rating: p.getRating(),
          rd: p.getRd(),
          vol: p.getVol(),
          conservativeScore: p.getRating() - 2 * p.getRd(),
          raceCount: c.raceCount + 1,
          lastRaceDate: new Date(),
          avgRank12:
            c.avgRank12 + (ranked.find(r => r.competitorId === c.id)!.rank12 - c.avgRank12) / (c.raceCount + 1),
        });
        await em.save(c);
      }
    });

    // Return sanitized competitors
    return competitors.map(sanitizeCompetitor);
  }

  /* ░░░░░░░░░░░░   HELPERS link / unlink   ░░░░░░░░░░░░ */

  linkCharacterVariant(competitorId: string, variantId: string) {
    return this.update(competitorId, { characterVariantId: variantId });
  }

  unlinkCharacterVariant(competitorId: string) {
    return this.update(competitorId, { characterVariantId: null });
  }
}
