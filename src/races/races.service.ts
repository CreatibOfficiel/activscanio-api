import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { CreateRaceDto } from './dtos/create-race.dto';

import { CompetitorsService } from '../competitors/competitors.service';

interface Opponent {
  rating: number;
  rd: number;
  id: string;
}

@Injectable()
export class RacesService {
  constructor(
    @InjectRepository(RaceEvent)
    private raceRepo: Repository<RaceEvent>,

    private competitorsService: CompetitorsService,
  ) {}

  // CREATE a new race
  async createRace(dto: CreateRaceDto): Promise<RaceEvent> {
    try {
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

      // Update competitors' Glicko-2 ratings
      try {
        await this.updateCompetitorsRating(savedRace.results);
      } catch (error) {
        console.error('Error updating competitor ratings:', error);
        // We still return the race even if rating update fails
      }

      return savedRace;
    } catch (error) {
      console.error('Error creating race:', error);
      throw new BadRequestException('Error creating race: ' + error.message);
    }
  }

  // GET /races/:raceId
  async findOne(raceId: string): Promise<RaceEvent> {
    const race = await this.raceRepo.findOne({
      where: { id: raceId },
      relations: ['results'],
    });

    if (!race) {
      throw new NotFoundException(`Race with ID ${raceId} not found`);
    }

    return race;
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
      throw new NotFoundException(`Race with ID ${raceId} not found`);
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
    try {
      await this.competitorsService.updateRatingsForRace(raceResults);
    } catch (error) {
      console.error('Error in updateCompetitorsRating:', error);
      throw new BadRequestException('Error updating competitor ratings: ' + error.message);
    }
  }
}
