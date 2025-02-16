import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { CreateRaceDto } from './dtos/create-race.dto';

import { CompetitorsService } from '../competitors/competitors.service';

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

    // Update Elo
    await this.updateCompetitorsElo(savedRace.results, raceDate);

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

  private expectedScore(rating: number, opponentRating: number): number {
    return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  }

  private async updateCompetitorsElo(
    raceResults: RaceResult[],
    raceDate: Date,
  ): Promise<void> {
    // Récupérer tous les compétiteurs concernés.
    const competitorIds = raceResults.map((r) => r.competitorId);
    const competitors = await Promise.all(
      competitorIds.map((id) => this.competitorsService.findOne(id))
    );
  
    // Récupérer les informations de la date
    const { week: newWeek, year: newYear } = getIsoWeekAndYear(raceDate);
    const isoDay = getIsoDayOfWeek(raceDate);
  
    // Construire une map des résultats pour un accès rapide.
    const resultMap: { [playerId: string]: RaceResult } = {};
    for (const res of raceResults) {
      resultMap[res.competitorId] = res;
    }

    type CompetitorEloInput = {
      id: string;
      rating: number;
      rank: number;
    };
  
    // Préparer les données pour le calcul round‑robin.
    // Chaque entrée contient : id, current Elo, et le rang final (1 = meilleur)
    const inputs: CompetitorEloInput[] = [];
    for (const comp of competitors) {
      if (!comp) continue;
      const res = resultMap[comp.id];
      const rank = res ? res.rank12 : 12; // valeur par défaut si pas de résultat
      inputs.push({
        id: comp.id,
        rating: comp.elo,
        rank: rank,
      });
    }
    const n = inputs.length;
    const kFactor = 32;
    // Initialiser l'accumulateur de changements Elo.
    const ratingChanges: { [id: string]: number } = { };
    for (const input of inputs) {
      ratingChanges[input.id] = 0;
    }
  
    // Comparaisons round‑robin entre toutes les paires de compétiteurs.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = inputs[i];
        const b = inputs[j];
  
        // Récupérer les scores de la course.
        const resA = resultMap[a.id];
        const resB = resultMap[b.id];
        const scoreA = resA ? resA.score : 0;
        const scoreB = resB ? resB.score : 0;
  
        // Calcul de la performance : si score total > 0, sinon égalité (0.5 chacun)
        let performanceA: number, performanceB: number;
        if (scoreA + scoreB > 0) {
          performanceA = scoreA / (scoreA + scoreB);
          performanceB = scoreB / (scoreA + scoreB);
        } else {
          performanceA = 0.5;
          performanceB = 0.5;
        }
  
        // Calcul de l'expected score (formule Elo classique)
        const expectedA = this.expectedScore(a.rating, b.rating);
        const expectedB = this.expectedScore(b.rating, a.rating);
  
        const deltaA = kFactor * (performanceA - expectedA);
        const deltaB = kFactor * (performanceB - expectedB);
  
        ratingChanges[a.id] += deltaA;
        ratingChanges[b.id] += deltaB;
      }
    }
  
    // Calcul de la note de base pour chaque compétiteur (moyenne des changements sur n-1 confrontations).
    const baseNewElo: { [id: string]: number } = {};
    for (const input of inputs) {
      baseNewElo[input.id] = input.rating + ratingChanges[input.id] / (n - 1);
    }
  
    // Mise à jour des bonus liés au résultat et à la date.
    for (const res of raceResults) {
      const comp = competitors.find((c) => c?.id === res.competitorId);
      if (!comp) continue;
  
      // Mises à jour des statistiques de course.
      comp.raceCount += 1;
      comp.lastRaceDate = raceDate;
      const sameDayAsPrevious = isSameDay(comp.lastRaceDay, raceDate);
      if (!sameDayAsPrevious) {
        comp.winStreak = 0;
      }
      comp.lastRaceDay = new Date(
        raceDate.getFullYear(),
        raceDate.getMonth(),
        raceDate.getDate()
      );
      comp.avgRank12 =
        (comp.avgRank12 * (comp.raceCount - 1) + res.rank12) / comp.raceCount;
  
      if (
        comp.currentWeekYear !== newYear ||
        comp.currentWeekNumber !== newWeek
      ) {
        comp.currentWeekYear = newYear;
        comp.currentWeekNumber = newWeek;
        comp.daysPlayedThisWeek = [];
      }
      if (!comp.daysPlayedThisWeek.includes(isoDay)) {
        comp.daysPlayedThisWeek.push(isoDay);
      }
  
      // Bonus fixes basés sur le résultat.
      let bonus = 0;
      if (res.rank12 > 4) {
        bonus -= (res.rank12 - 4) * 5;
      }
      if (res.score === 60) {
        bonus += 10;
      }
  
      // Bonus liés à la date.
      if (res.rank12 === 1 && sameDayAsPrevious) {
        comp.winStreak++;
      } else if (res.rank12 === 1 && !sameDayAsPrevious) {
        comp.winStreak = 1;
      } else {
        comp.winStreak = 0;
      }
      if (comp.winStreak >= 2) {
        bonus += 5 * (comp.winStreak - 1);
      }
      if (hasPlayedMondayToThursday(comp.daysPlayedThisWeek)) {
        bonus += 10;
      }
  
      // Mise à jour finale de l'Elo : base calculée + bonus.
      comp.elo = Math.floor(baseNewElo[comp.id] + bonus);
    }
  
    // Sauvegarde de tous les compétiteurs mis à jour.
    for (const comp of competitors) {
      if (comp) {
        await this.competitorsService.update(comp.id, comp);
      }
    }
  }
}
