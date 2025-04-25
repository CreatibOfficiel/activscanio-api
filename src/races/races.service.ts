import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { CreateRaceDto } from './dtos/create-race.dto';

import { CompetitorsService } from '../competitors/competitors.service';
import { RatingService } from 'src/rating/rating.service';
import { Rating } from 'src/rating/rating.interface';

@Injectable()
export class RacesService {
  constructor(
    @InjectRepository(RaceEvent)
    private raceRepo: Repository<RaceEvent>,

    private competitorsService: CompetitorsService,
    private ratingService: RatingService,
  ) {}

  // CREATE a new race
  async createRace(dto: CreateRaceDto): Promise<RaceEvent> {
    const raceDate = new Date(dto.date);

    const race = new RaceEvent();
    race.date = raceDate;

    const results = dto.results.map((r) => {
      const rr = new RaceResult();
      rr.competitorId = r.competitorId;
      rr.rank12 = r.rank12;
      rr.score = r.score;
      return rr;
    });

    race.results = results;

    const savedRace = await this.raceRepo.save(race);

    // Update competitors' TrueSkill ratings
    await this.updateCompetitorsRating(savedRace.results);

    // Recompute global rank
    await this.competitorsService.recomputeGlobalRank();

    return savedRace;
  }

  // GET /races/:raceId
  async findOne(raceId: string): Promise<RaceEvent | null> {
    return this.raceRepo.findOne({
      where: { id: raceId },
      relations: ['results'],
    });
  }

  // GET /races?recent=true
  async findAll(recent?: boolean): Promise<RaceEvent[]> {
    const qb = this.raceRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.results', 'res')
      .orderBy('r.date', 'DESC');

    if (recent) {
      // For example: last 7 days, limit 20
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      qb.where('r.date >= :minDate', { minDate: sevenDaysAgo });
      qb.limit(20);
    }

    return qb.getMany();
  }

  // GET /competitors/:competitorId/recent-races (via CompetitorsController)
  async getRecentRacesForCompetitor(competitorId: string): Promise<any[]> {
    // Retrieve all races with results
    const allRaces = await this.raceRepo.find({
      relations: ['results'],
      order: { date: 'DESC' },
    });

    // Filter where the competitor participated
    const competitorRaces = allRaces
      .filter((race) =>
        race.results.some((r) => r.competitorId === competitorId),
      )
      .slice(0, 3); // last 3

    // Extract info
    return competitorRaces.map((race) => {
      const compResult = race.results.find(
        (r) => r.competitorId === competitorId,
      );
      return {
        raceId: race.id,
        date: race.date,
        rank12: compResult?.rank12,
        score: compResult?.score,
      };
    });
  }

  // GET /races/:raceId/similar
  async findSimilarRaces(raceId: string): Promise<RaceEvent[]> {
    // Reference race
    const refRace = await this.raceRepo.findOne({
      where: { id: raceId },
      relations: ['results'],
    });
    if (!refRace) {
      throw new Error('Race not found');
    }

    // Extract competitor IDs
    const refCompetitorIds = refRace.results.map((r) => r.competitorId).sort();

    // Retrieve all
    const allRaces = await this.raceRepo.find({
      relations: ['results'],
      order: { date: 'DESC' },
    });

    // Filter those with the same exact 4 competitor IDs
    const races = allRaces.filter((race) => {
      if (race.id === raceId) return false; // exclude same
      const raceCompetitorIds = race.results.map((r) => r.competitorId).sort();
      return (
        JSON.stringify(raceCompetitorIds) === JSON.stringify(refCompetitorIds)
      );
    });

    // Limit 3
    return races.slice(0, 3);
  }

  private async updateCompetitorsRating(
    raceResults: RaceResult[],
  ): Promise<void> {
    // 1) Get all competitor IDs from race
    const competitorIds = raceResults.map((r) => r.competitorId);
    const competitors = await Promise.all(
      competitorIds.map((id) => this.competitorsService.findOne(id)),
    );
    const initialPositions: { [competitorId: string]: number } = {};

    // 2) Sort the results by rank12
    const sortedResults = [...raceResults].sort((a, b) => a.rank12 - b.rank12);

    // 3) Assign a rank 1..N to each competitor (N is the number of humans)
    //   1 = best rank
    let rank = 1;
    for (const result of sortedResults) {
      initialPositions[result.competitorId] = result.rank12;
      result.rank12 = rank;
      rank++;
    }

    // 4) Build the array for TrueSkill input
    const inputs: { id: string; rating: Rating; rank: number }[] = [];
    for (const comp of competitors) {
      if (!comp) continue;

      const r = raceResults.find((res) => res.competitorId === comp.id);
      if (!r) continue;

      inputs.push({
        id: comp.id,
        rating: {
          mu: comp.mu,
          sigma: comp.sigma,
        },
        rank: r.rank12,
      });
    }

    // 5) Call TrueSkill
    const updated = this.ratingService.updateRatings(inputs);

    // 6) Update the database
    for (const u of updated) {
      const comp = competitors.find((c) => c?.id === u.id);
      if (!comp) continue;

      const r = raceResults.find((res) => res.competitorId === comp.id);
      if (!r) continue;

      // Store the new TS rating
      comp.mu = u.newRating.mu;
      comp.sigma = u.newRating.sigma;

      // Get the initial position
      const initialPos = initialPositions[comp.id];
      if (initialPos === undefined) continue;

      // Calculate average positions for this competitor
      comp.avgRank12 = comp.avgRank12 + (initialPos - comp.avgRank12) / (comp.raceCount + 1);

      // Increment raceCount
      comp.raceCount++;

      // Update win streak
      if (comp.rank === 1) {
        comp.winStreak++;
      } else {
        comp.winStreak = 0;
      }

      // Update lastRaceDate
      comp.lastRaceDate = new Date();

      // Update the competitor
      // Note: this is a partial update, so we don't need to pass all fields
      await this.competitorsService.update(comp.id, {
        ...comp,
        characterVariantId: comp.characterVariant ? comp.characterVariant.id : null,
      });
    }
  }
}
