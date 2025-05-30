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
      // 1) Get all competitor IDs from race
      const competitorIds = raceResults.map((r) => r.competitorId);
      const competitors = await Promise.all(
        competitorIds.map((id) => this.competitorsService.findOne(id)),
      );

      // 2) Sort the results by rank12
      const sortedResults = [...raceResults].sort((a, b) => a.rank12 - b.rank12);

      // 3) For each competitor, calculate their score against others
      for (const competitor of competitors) {
        if (!competitor) continue;

        const competitorResult = raceResults.find(
          (r) => r.competitorId === competitor.id,
        );
        if (!competitorResult) continue;

        // Calculate scores against other competitors
        const opponents: Opponent[] = [];
        const scores: number[] = [];

        for (const otherResult of sortedResults) {
          if (otherResult.competitorId === competitor.id) continue;

          const otherCompetitor = competitors.find(
            (c) => c?.id === otherResult.competitorId,
          );
          if (!otherCompetitor) continue;

          opponents.push({
            rating: otherCompetitor.rating,
            rd: otherCompetitor.rd,
            id: otherCompetitor.id,
          });

          // Score is 1 if better rank, 0 if worse rank, 0.5 if same rank
          const score = competitorResult.rank12 < otherResult.rank12
            ? 1
            : competitorResult.rank12 > otherResult.rank12
            ? 0
            : 0.5;

          scores.push(score);
        }

        try {
          // Update the competitor's rating
          await this.competitorsService.updateRatings(competitor.id, opponents.map((o, i) => ({
            id: o.id,
            score: scores[i],
          })));

          // Update other stats
          const initialPos = competitorResult.rank12;
          competitor.avgRank12 = competitor.avgRank12 + (initialPos - competitor.avgRank12) / (competitor.raceCount + 1);
          competitor.raceCount++;
          competitor.lastRaceDate = new Date();

          // Update win streak
          if (competitorResult.rank12 === 1) {
            competitor.winStreak++;
          } else {
            competitor.winStreak = 0;
          }

          // Update the competitor
          await this.competitorsService.update(competitor.id, {
            ...competitor,
            characterVariantId: competitor.characterVariant ? competitor.characterVariant.id : null,
          });
        } catch (error) {
          console.error(`Error updating competitor ${competitor.id}:`, error);
          // Continue with other competitors even if one fails
        }
      }
    } catch (error) {
      console.error('Error in updateCompetitorsRating:', error);
      throw new BadRequestException('Error updating competitor ratings: ' + error.message);
    }
  }
}
