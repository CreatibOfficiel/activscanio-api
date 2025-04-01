import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { CreateRaceDto } from './dtos/create-race.dto';

import { CompetitorsService } from '../competitors/competitors.service';
import { RatingService } from 'src/rating/rating.service';

// --- UTILS ---
function getIsoDayOfWeek(date: Date): number {
  // In JS, getDay() => 0..6 (Sun..Sat). We want 1..7 (Mon..Sun).
  return ((date.getDay() + 6) % 7) + 1;
}

function getIsoWeekAndYear(date: Date): { week: number; year: number } {
  // Simplistic approach. Ideally use date-fns or dayjs for accurate ISO weeks.
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const daysOffset = Math.floor(
    (date.getTime() - jan1.getTime()) / (24 * 3600 * 1000),
  );
  const week = Math.ceil((daysOffset + 1) / 7);
  return { week, year: date.getFullYear() };
}

function isSameDay(date1: Date | string | null, date2: Date): boolean {
  if (!date1) return false;
  
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  
  return (
    d1.getFullYear() === date2.getFullYear() &&
    d1.getMonth() === date2.getMonth() &&
    d1.getDate() === date2.getDate()
  );
}

// Checks if competitor played each day Monday->Thursday
function hasPlayedMondayToThursday(days: number[]): boolean {
  const setDays = new Set(days);
  return setDays.has(1) && setDays.has(2) && setDays.has(3) && setDays.has(4);
}

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
    const qb = this.raceRepo.createQueryBuilder('r')
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
      .filter((race) => race.results.some((r) => r.competitorId === competitorId))
      .slice(0, 3); // last 3

    // Extract info
    return competitorRaces.map((race) => {
      const compResult = race.results.find((r) => r.competitorId === competitorId);
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
      return JSON.stringify(raceCompetitorIds) === JSON.stringify(refCompetitorIds);
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
      competitorIds.map((id) => this.competitorsService.findOne(id))
    );

    interface RatingInput {
      id: string;
      rating: { mu: number; sigma: number };
      rank: number;
    }

    // 2) Build the array for TrueSkill input
    //    rank is e.g. result.rank12 among the 4 humans, or 1..4
    const inputs: RatingInput[] = [];
    for (const comp of competitors) {
      if (!comp) continue;
      const r = raceResults.find((res) => res.competitorId === comp.id);

      // if r.rank12 is 1..4 among humans
      inputs.push({
        id: comp.id,
        rating: { mu: comp.mu, sigma: comp.sigma },
        rank: r ? r.rank12 : 4, // default if not found
      });
    }

    // 3) Call TrueSkill
    const updated = this.ratingService.updateRatings(inputs);

    // 4) Update the database
    for (const u of updated) {
      const comp = competitors.find((c) => c?.id === u.id);
      if (!comp) continue;

      // store the new TS rating
      comp.mu = u.newRating.mu;
      comp.sigma = u.newRating.sigma;

      // Keep any other logic you want: e.g. comp.raceCount++, streak, etc.
      comp.raceCount++;

      // Update win streak
      if (comp.rank === 1) {
        comp.winStreak++;
      } else {
        comp.winStreak = 0;
      }
      await this.competitorsService.update(comp.id, comp);
    }
  }
}
