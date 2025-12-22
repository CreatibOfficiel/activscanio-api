/**
 * OddsCalculatorService
 *
 * Responsible for calculating betting odds for competitors in a given week.
 *
 * Architecture:
 * - Pure calculation logic (no side effects)
 * - Configurable parameters (via config file)
 * - Detailed intermediate steps (for debugging)
 * - Type-safe throughout
 *
 * Calculation Flow:
 * 1. Fetch all competitors + recent race data
 * 2. Filter eligible competitors (min 1 race this week)
 * 3. Calculate conservative scores (ELO - 2*RD)
 * 4. Calculate form factors (recent performance)
 * 5. Calculate raw probabilities (normalized scores)
 * 6. Adjust probabilities with form factors
 * 7. Normalize probabilities (sum = 1)
 * 8. Convert to odds (BASE / probability)
 * 9. Apply min/max capping
 * 10. Save to database
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Competitor } from '../../competitors/competitor.entity';
import { RaceEvent } from '../../races/race-event.entity';
import { RaceResult } from '../../races/race-result.entity';
import { CompetitorOdds } from '../entities/competitor-odds.entity';
import { BettingWeek } from '../entities/betting-week.entity';
import {
  CompetitorWithStats,
  OddsCalculationStep,
  OddsCalculationResult,
  CompetitorOdd,
  OddMetadata,
  RecentRacePerformance,
} from '../types/odds-calculator.types';
import {
  DEFAULT_ODDS_PARAMS,
  FORM_RANK_THRESHOLDS,
  ELIGIBILITY_RULES,
  ODDS_LOGGER_CONFIG,
} from '../config/odds-calculator.config';

@Injectable()
export class OddsCalculatorService {
  private readonly logger = new Logger(OddsCalculatorService.name);

  constructor(
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(RaceEvent)
    private readonly raceEventRepository: Repository<RaceEvent>,
    @InjectRepository(RaceResult)
    private readonly raceResultRepository: Repository<RaceResult>,
    @InjectRepository(CompetitorOdds)
    private readonly competitorOddsRepository: Repository<CompetitorOdds>,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
  ) {}

  /**
   * Calculate odds for all competitors in a betting week
   *
   * @param bettingWeekId - The week to calculate odds for
   * @returns Complete calculation result with all steps
   */
  async calculateOddsForWeek(
    bettingWeekId: string,
  ): Promise<OddsCalculationResult> {
    this.logger.log(`Starting odds calculation for week ${bettingWeekId}`);

    // 1. Fetch betting week
    const week = await this.bettingWeekRepository.findOne({
      where: { id: bettingWeekId },
    });

    if (!week) {
      throw new Error(`Betting week ${bettingWeekId} not found`);
    }

    // 2. Fetch all competitors with their stats
    const competitorsWithStats = await this.fetchCompetitorsWithStats(week);

    // 3. Filter eligible competitors
    const eligibleCompetitors = competitorsWithStats.filter(
      (c) => c.isEligible,
    );

    if (eligibleCompetitors.length === 0) {
      this.logger.warn(`No eligible competitors for week ${bettingWeekId}`);
      return {
        bettingWeekId,
        calculatedAt: new Date(),
        eligibleCompetitorsCount: 0,
        totalCompetitorsCount: competitorsWithStats.length,
        odds: [],
        calculationSteps: [],
      };
    }

    // 4. Calculate odds
    const calculationSteps = this.calculateOddsSteps(eligibleCompetitors);

    // 5. Create CompetitorOdd objects
    const odds: CompetitorOdd[] = calculationSteps.map((step) => ({
      competitorId: step.competitorId,
      competitorName: step.competitorName,
      odd: step.cappedOdd,
      probability: step.normalizedProbability,
      formFactor: step.formFactor,
      isEligible: step.isEligible,
      metadata: {
        elo: step.rating,
        rd: step.rd,
        recentWins: step.recentRaceCount,
        winStreak: step.winStreak,
        raceCount: step.recentRaceCount,
        avgRank: step.avgRecentRank,
        formFactor: step.formFactor,
        probability: step.normalizedProbability,
      },
    }));

    // 6. Save to database
    await this.saveOddsToDatabase(bettingWeekId, odds);

    const result: OddsCalculationResult = {
      bettingWeekId,
      calculatedAt: new Date(),
      eligibleCompetitorsCount: eligibleCompetitors.length,
      totalCompetitorsCount: competitorsWithStats.length,
      odds,
      calculationSteps: ODDS_LOGGER_CONFIG.logCalculationSteps
        ? calculationSteps
        : [],
    };

    this.logger.log(
      `Odds calculation complete: ${eligibleCompetitors.length} competitors, avg odd: ${this.calculateAverageOdd(odds).toFixed(2)}`,
    );

    return result;
  }

  /**
   * Fetch all competitors with their recent race statistics
   */
  private async fetchCompetitorsWithStats(
    week: BettingWeek,
  ): Promise<CompetitorWithStats[]> {
    const competitors = await this.competitorRepository.find();

    const competitorsWithStats = await Promise.all(
      competitors.map(async (competitor) => {
        // Get races within this week
        const racesThisWeek = await this.raceResultRepository
          .createQueryBuilder('result')
          .innerJoin('result.race', 'race')
          .where('result.competitorId = :competitorId', {
            competitorId: competitor.id,
          })
          .andWhere('race.date >= :startDate', { startDate: week.startDate })
          .andWhere('race.date <= :endDate', { endDate: week.endDate })
          .select(['result.rank12', 'race.date', 'race.id'])
          .getRawMany();

        // Get recent races for form calculation
        const recentRaces = await this.raceResultRepository
          .createQueryBuilder('result')
          .innerJoin('result.race', 'race')
          .where('result.competitorId = :competitorId', {
            competitorId: competitor.id,
          })
          .orderBy('race.date', 'DESC')
          .limit(DEFAULT_ODDS_PARAMS.recentRacesCount)
          .select(['result.rank12', 'race.date', 'race.id'])
          .getRawMany();

        const recentRacePerformances: RecentRacePerformance[] = recentRaces.map(
          (r) => ({
            rank12: r.result_rank12,
            date: r.race_date,
            raceId: r.race_id,
          }),
        );

        return {
          competitor,
          recentRaces: recentRacePerformances,
          isEligible:
            racesThisWeek.length >= ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK,
        };
      }),
    );

    return competitorsWithStats;
  }

  /**
   * Calculate odds with detailed intermediate steps
   *
   * This method performs the core calculation logic and returns
   * all intermediate values for transparency and debugging.
   */
  private calculateOddsSteps(
    competitorsWithStats: CompetitorWithStats[],
  ): OddsCalculationStep[] {
    const steps: OddsCalculationStep[] = [];

    // Step 1: Calculate conservative scores and total
    let totalConservativeScore = 0;

    for (const { competitor, recentRaces } of competitorsWithStats) {
      const conservativeScore = competitor.rating - 2 * competitor.rd;
      totalConservativeScore += conservativeScore;

      steps.push({
        competitorId: competitor.id,
        competitorName: `${competitor.firstName} ${competitor.lastName}`,
        rating: competitor.rating,
        rd: competitor.rd,
        conservativeScore,
        recentRaceCount: recentRaces.length,
        avgRecentRank: 0, // Will calculate next
        winStreak: competitor.winStreak,
        formFactor: 1.0, // Will calculate next
        rawProbability: 0,
        adjustedProbability: 0,
        normalizedProbability: 0,
        odd: 0,
        cappedOdd: 0,
        isEligible: true,
        calculatedAt: new Date(),
      });
    }

    // Step 2: Calculate form factors and raw probabilities
    for (const step of steps) {
      const { recentRaces } = competitorsWithStats.find(
        (c) => c.competitor.id === step.competitorId,
      )!;

      // Calculate average recent rank
      step.avgRecentRank =
        recentRaces.length > 0
          ? recentRaces.reduce((sum, r) => sum + r.rank12, 0) /
            recentRaces.length
          : 6.5; // Default to mid-rank if no races

      // Calculate form factor
      step.formFactor = this.calculateFormFactor(
        step.avgRecentRank,
        step.winStreak,
        step.recentRaceCount,
      );

      // Calculate raw probability (before form adjustment)
      step.rawProbability = step.conservativeScore / totalConservativeScore;
    }

    // Step 3: Adjust probabilities with form factors
    for (const step of steps) {
      step.adjustedProbability = step.rawProbability * step.formFactor;
    }

    // Step 4: Normalize probabilities (sum = 1)
    const totalAdjustedProbability = steps.reduce(
      (sum, step) => sum + step.adjustedProbability,
      0,
    );

    for (const step of steps) {
      step.normalizedProbability =
        step.adjustedProbability / totalAdjustedProbability;
    }

    // Step 5: Calculate odds and apply capping
    for (const step of steps) {
      // Odd = BASE / probability
      step.odd =
        DEFAULT_ODDS_PARAMS.baseMultiplier / step.normalizedProbability;

      // Apply min/max bounds
      step.cappedOdd = Math.max(
        DEFAULT_ODDS_PARAMS.minOdd,
        Math.min(step.odd, DEFAULT_ODDS_PARAMS.maxOdd),
      );
    }

    return steps;
  }

  /**
   * Calculate form factor based on recent performance
   *
   * Form factor ranges from 0.7 (poor form) to 1.3 (excellent form)
   *
   * Components:
   * - Rank-based factor (based on average recent position)
   * - Win streak bonus (each consecutive win adds 5%)
   *
   * @param avgRecentRank - Average rank in recent races (1-12)
   * @param winStreak - Number of consecutive wins
   * @param recentRaceCount - Number of recent races
   * @returns Form factor between 0.7 and 1.3
   */
  private calculateFormFactor(
    avgRecentRank: number,
    winStreak: number,
    recentRaceCount: number,
  ): number {
    // No recent races = neutral form
    if (recentRaceCount === 0) {
      return 1.0;
    }

    // Determine rank-based factor
    let rankFactor: number;

    if (avgRecentRank <= FORM_RANK_THRESHOLDS.EXCELLENT.maxRank) {
      rankFactor = FORM_RANK_THRESHOLDS.EXCELLENT.baseFactor;
    } else if (avgRecentRank <= FORM_RANK_THRESHOLDS.GOOD.maxRank) {
      rankFactor = FORM_RANK_THRESHOLDS.GOOD.baseFactor;
    } else if (avgRecentRank <= FORM_RANK_THRESHOLDS.AVERAGE.maxRank) {
      rankFactor = FORM_RANK_THRESHOLDS.AVERAGE.baseFactor;
    } else {
      rankFactor = FORM_RANK_THRESHOLDS.POOR.baseFactor;
    }

    // Add win streak bonus
    const streakBonus = winStreak * DEFAULT_ODDS_PARAMS.winStreakBonus;

    // Combine factors
    const formFactor = rankFactor + streakBonus;

    // Apply bounds
    return Math.max(
      DEFAULT_ODDS_PARAMS.formFactorMin,
      Math.min(formFactor, DEFAULT_ODDS_PARAMS.formFactorMax),
    );
  }

  /**
   * Save calculated odds to database
   */
  private async saveOddsToDatabase(
    bettingWeekId: string,
    odds: CompetitorOdd[],
  ): Promise<void> {
    const now = new Date();

    const oddsEntities = odds.map((odd) =>
      this.competitorOddsRepository.create({
        competitorId: odd.competitorId,
        bettingWeekId,
        odd: odd.odd,
        calculatedAt: now,
        metadata: odd.metadata,
      }),
    );

    await this.competitorOddsRepository.save(oddsEntities);

    this.logger.log(`Saved ${oddsEntities.length} odds to database`);
  }

  /**
   * Calculate average odd (for logging)
   */
  private calculateAverageOdd(odds: CompetitorOdd[]): number {
    if (odds.length === 0) return 0;
    return odds.reduce((sum, o) => sum + o.odd, 0) / odds.length;
  }

  /**
   * Get latest odds for a week (public method for controller)
   */
  async getLatestOddsForWeek(weekId: string): Promise<CompetitorOdd[]> {
    const oddsEntities = await this.competitorOddsRepository
      .createQueryBuilder('odds')
      .where('odds.bettingWeekId = :weekId', { weekId })
      .distinctOn(['odds.competitorId'])
      .orderBy('odds.competitorId')
      .addOrderBy('odds.calculatedAt', 'DESC')
      .leftJoinAndSelect('odds.competitor', 'competitor')
      .getMany();

    return oddsEntities.map((entity) => ({
      competitorId: entity.competitorId,
      competitorName: `${entity.competitor.firstName} ${entity.competitor.lastName}`,
      odd: entity.odd,
      probability: entity.metadata.probability,
      formFactor: entity.metadata.formFactor,
      isEligible: true,
      metadata: entity.metadata,
    }));
  }

  /**
   * Get eligible competitors for a betting week
   *
   * Returns competitors who have at least MIN_RACES_THIS_WEEK races
   * in the specified betting week.
   *
   * @param weekId - Betting week UUID
   * @returns List of eligible competitors with their stats
   */
  async getEligibleCompetitors(weekId: string): Promise<{
    weekId: string;
    eligibleCount: number;
    totalCount: number;
    minRacesRequired: number;
    competitors: Array<{
      id: string;
      firstName: string;
      lastName: string;
      rating: number;
      rd: number;
      racesThisWeek: number;
    }>;
  }> {
    // Fetch betting week
    const week = await this.bettingWeekRepository.findOne({
      where: { id: weekId },
    });

    if (!week) {
      throw new Error(`Betting week ${weekId} not found`);
    }

    // Get all competitors
    const allCompetitors = await this.competitorRepository.find();

    // Check eligibility for each competitor
    const competitorsWithRaceCount = await Promise.all(
      allCompetitors.map(async (competitor) => {
        const racesThisWeek = await this.raceResultRepository
          .createQueryBuilder('result')
          .innerJoin('result.race', 'race')
          .where('result.competitorId = :competitorId', {
            competitorId: competitor.id,
          })
          .andWhere('race.date >= :startDate', { startDate: week.startDate })
          .andWhere('race.date <= :endDate', { endDate: week.endDate })
          .getCount();

        return {
          competitor,
          racesThisWeek,
          isEligible: racesThisWeek >= ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK,
        };
      }),
    );

    // Filter eligible competitors
    const eligibleCompetitors = competitorsWithRaceCount
      .filter((c) => c.isEligible)
      .map((c) => ({
        id: c.competitor.id,
        firstName: c.competitor.firstName,
        lastName: c.competitor.lastName,
        rating: c.competitor.rating,
        rd: c.competitor.rd,
        racesThisWeek: c.racesThisWeek,
      }));

    this.logger.log(
      `Found ${eligibleCompetitors.length}/${allCompetitors.length} eligible competitors for week ${weekId}`,
    );

    return {
      weekId,
      eligibleCount: eligibleCompetitors.length,
      totalCount: allCompetitors.length,
      minRacesRequired: ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK,
      competitors: eligibleCompetitors,
    };
  }
}
