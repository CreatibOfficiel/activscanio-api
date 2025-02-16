import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Competitor } from './competitor.entity';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';

@Injectable()
export class CompetitorsService {
  constructor(
    @InjectRepository(Competitor)
    private competitorsRepo: Repository<Competitor>,
  ) {}

  findAll(): Promise<Competitor[]> {
    return this.competitorsRepo.find();
  }

  findOne(id: string): Promise<Competitor | null> {
    return this.competitorsRepo.findOne({ where: { id } });
  }

  async create(dto: CreateCompetitorDto): Promise<Competitor> {
    const competitor = this.competitorsRepo.create(dto);
    // Init fields
    competitor.lastRaceDate = null;
    competitor.lastRaceDay = null;
    competitor.winStreak = 0;
    competitor.daysPlayedThisWeek = [];
    competitor.currentWeekNumber = 0;
    competitor.currentWeekYear = 0;

    return this.competitorsRepo.save(competitor);
  }

  async update(id: string, dto: UpdateCompetitorDto): Promise<Competitor> {
    const competitor = await this.competitorsRepo.findOne({ where: { id } });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }
    Object.assign(competitor, dto);
    return this.competitorsRepo.save(competitor);
  }

  /**
   * Recompute global rank for all competitors:
   * - Excludes those with zero races => rank=0
   * - Applies an exponential inactivity penalty (once per day) if >7 days inactive; floor Elo=750
   */
  async recomputeGlobalRank(): Promise<void> {
    const now = new Date();
    const allCompetitors = await this.competitorsRepo.find();
  
    // 1) Apply inactivity penalty
    for (const c of allCompetitors) {
      if (c.raceCount > 0 && c.lastRaceDate) {
        const diffDays = Math.floor(
          (now.getTime() - c.lastRaceDate.getTime()) / (1000 * 3600 * 24)
        );
        if (diffDays > 7) {
          const penaltyDays = diffDays - 7;
          const dailyFactor = 0.98;
          const newElo = c.elo * Math.pow(dailyFactor, penaltyDays);
          c.elo = Math.max(750, Math.floor(newElo));
        }
      }
    }
  
    // 2) Filter competitors who have played at least one race.
    const withGames = allCompetitors.filter((c) => c.raceCount > 0);
  
    // 3) Sort using tie-break criteria.
    // On crée une copie pour conserver l'ordre initial dans "withGames".
    const sortedCompetitors = [...withGames].sort((a, b) => {
      // Compare Elo (desc)
      const eloComp = b.elo - a.elo;
      if (eloComp !== 0) return eloComp;
  
      // Compare avgRank12 (asc)
      const avgRankComp = a.avgRank12 - b.avgRank12;
      if (avgRankComp !== 0) return avgRankComp;
  
      // Compare raceCount (desc)
      const raceCountComp = b.raceCount - a.raceCount;
      if (raceCountComp !== 0) return raceCountComp;
  
      // Nouvelle condition pour l'égalité parfaite :
      // Si l'un est déjà dans le top 3 dans l'ordre original et l'autre non.
      const indexA = withGames.indexOf(a);
      const indexB = withGames.indexOf(b);
      if (indexA < 3 && indexB >= 3) return -1;
      if (indexB < 3 && indexA >= 3) return 1;
  
      // Sinon, ils sont considérés comme équivalents.
      return 0;
    });
  
    // 4) Attribuer les rangs en gérant les égalités.
    let currentRank = 1;
    for (let i = 0; i < sortedCompetitors.length; i++) {
      if (i > 0) {
        const prev = sortedCompetitors[i - 1];
        const curr = sortedCompetitors[i];
        // Si tous les critères sont égaux, le rang reste identique.
        if (
          curr.elo === prev.elo &&
          curr.avgRank12 === prev.avgRank12 &&
          curr.raceCount === prev.raceCount
        ) {
          curr.rank = prev.rank;
        } else {
          curr.rank = currentRank;
        }
      } else {
        sortedCompetitors[i].rank = currentRank;
      }
      currentRank++;
    }
  
    // 5) Les compétiteurs n'ayant joué aucune course reçoivent un rang de 0.
    for (const c of allCompetitors) {
      if (c.raceCount === 0) {
        c.rank = 0;
      }
    }
  
    await this.competitorsRepo.save(allCompetitors);
  }
}
