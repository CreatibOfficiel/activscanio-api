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
    competitor.winStreak = 0;

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
   * Recompute global rank for all competitors based on TrueSkill (mu, sigma).
   * - Excludes those with zero races => rank=0
   * - Applies an exponential inactivity penalty if >7 days inactive
   *   but does so on a TEMPORARY skill measure, not permanently on mu/sigma
   * - Preserves your tie-break logic (avgRank12, raceCount, special top-3 check)
   */
  async recomputeGlobalRank(): Promise<void> {
    const now = new Date();
    const allCompetitors = await this.competitorsRepo.find();

    // 1) Compute a "temporary skill" for each competitor,
    //    including an inactivity penalty if inactive >7 days.
    for (const c of allCompetitors) {
      if (c.raceCount > 0 && c.lastRaceDate) {
        // Base TrueSkill measure:
        const baseSkill = c.mu - 3 * c.sigma;

        // Days since last race
        const diffDays = Math.floor(
          (now.getTime() - c.lastRaceDate.getTime()) / (1000 * 3600 * 24),
        );

        if (diffDays > 7) {
          const penaltyDays = diffDays - 7;
          const dailyFactor = 0.98; // decays 2% per day after day 7
          const adjustedSkill = baseSkill * Math.pow(dailyFactor, penaltyDays);

          c['inactiveSkill'] = adjustedSkill;
        } else {
          // Less than or equal to 7 days => no penalty
          c['inactiveSkill'] = baseSkill;
        }
      } else {
        // If this competitor has never raced or lastRaceDate is null,
        // set their "inactiveSkill" to 0.
        c['inactiveSkill'] = 0;
      }
    }

    // 2) Filter competitors who have played at least one race => they get a real rank.
    const withGames = allCompetitors.filter((c) => c.raceCount > 0);

    // 3) Sort using tie-break criteria:
    //    - Compare inactiveSkill (desc)
    //    - Compare avgRank12 (asc)
    //    - Compare raceCount (desc)
    //    - If still tied, apply your top-3 special check
    const sortedCompetitors = [...withGames].sort((a, b) => {
      // Compare "inactiveSkill" desc
      const skillA = a['inactiveSkill'];
      const skillB = b['inactiveSkill'];
      const skillComp = skillB - skillA;
      if (skillComp !== 0) return skillComp;

      // Compare avgRank12 asc
      const avgRankComp = a.avgRank12 - b.avgRank12;
      if (avgRankComp !== 0) return avgRankComp;

      // Compare raceCount desc
      const raceCountComp = b.raceCount - a.raceCount;
      if (raceCountComp !== 0) return raceCountComp;

      // Top-3 tie-break condition
      const indexA = withGames.indexOf(a);
      const indexB = withGames.indexOf(b);
      if (indexA < 3 && indexB >= 3) return -1;
      if (indexB < 3 && indexA >= 3) return 1;

      // Otherwise, they remain tied
      return 0;
    });

    // 4) Assign ranks with tie handling
    let currentRank = 1;
    for (let i = 0; i < sortedCompetitors.length; i++) {
      if (i > 0) {
        const prev = sortedCompetitors[i - 1];
        const curr = sortedCompetitors[i];

        // If all tie-break criteria are equal => same rank
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

    // 6) Save all changes
    await this.competitorsRepo.save(allCompetitors);
  }
}
