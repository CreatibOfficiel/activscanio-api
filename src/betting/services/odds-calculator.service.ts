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
import { Repository } from 'typeorm';
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
  RecentRacePerformance,
  IneligibilityReason,
} from '../types/odds-calculator.types';
import {
  DEFAULT_ODDS_PARAMS,
  FORM_RANK_THRESHOLDS,
  ELIGIBILITY_RULES,
  ODDS_LOGGER_CONFIG,
  POSITION_FACTORS,
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
      oddFirst: step.oddFirst,
      oddSecond: step.oddSecond,
      oddThird: step.oddThird,
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
          (r: any) => ({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            rank12: r.result_rank12,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            date: r.race_date,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            raceId: r.race_id,
          }),
        );

        // Check eligibility with new rules
        const { isEligible, reason, recentRacesIn14Days } =
          this.checkCompetitorEligibility(
            competitor,
            recentRacePerformances,
            racesThisWeek.length,
          );

        return {
          competitor,
          recentRaces: recentRacePerformances,
          isEligible,
          ineligibilityReason: reason,
          calibrationProgress: competitor.totalLifetimeRaces,
          recentRacesIn14Days,
        };
      }),
    );

    return competitorsWithStats;
  }

  /**
   * Check if a competitor is eligible for betting
   *
   * Rules:
   * 1. Calibration: Must have >= MIN_LIFETIME_RACES total races (never resets)
   * 2. Recent activity: Must have >= MIN_RECENT_RACES in the last RECENT_WINDOW_DAYS
   * 3. Weekly activity: Must have >= MIN_RACES_THIS_WEEK in current betting week
   */
  private checkCompetitorEligibility(
    competitor: Competitor,
    recentRaces: RecentRacePerformance[],
    racesThisWeekCount: number,
  ): {
    isEligible: boolean;
    reason: IneligibilityReason;
    recentRacesIn14Days: number;
  } {
    // Rule 1: Calibration check (lifetime races)
    if (competitor.totalLifetimeRaces < ELIGIBILITY_RULES.MIN_LIFETIME_RACES) {
      return {
        isEligible: false,
        reason: 'calibrating',
        recentRacesIn14Days: 0,
      };
    }

    // Rule 2: Recent activity check (rolling 14-day window)
    const windowStart = new Date();
    windowStart.setDate(
      windowStart.getDate() - ELIGIBILITY_RULES.RECENT_WINDOW_DAYS,
    );

    const recentRacesIn14Days = recentRaces.filter(
      (r) => new Date(r.date) >= windowStart,
    ).length;

    if (recentRacesIn14Days < ELIGIBILITY_RULES.MIN_RECENT_RACES) {
      return {
        isEligible: false,
        reason: 'inactive',
        recentRacesIn14Days,
      };
    }

    // Rule 3: Weekly activity check
    if (racesThisWeekCount < ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK) {
      return {
        isEligible: false,
        reason: 'no_races_this_week',
        recentRacesIn14Days,
      };
    }

    return {
      isEligible: true,
      reason: null,
      recentRacesIn14Days,
    };
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

    // Step 1: Calculate conservative scores
    for (const { competitor, recentRaces } of competitorsWithStats) {
      const conservativeScore = competitor.rating - 2 * competitor.rd;

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
        oddFirst: 0,
        oddSecond: 0,
        oddThird: 0,
        isEligible: true,
        calculatedAt: new Date(),
      });
    }

    // Shift scores to guarantee all positive values before probability calculation.
    // If any conservativeScore is negative, shift all scores up so the minimum becomes 1.
    const minScore = Math.min(...steps.map((s) => s.conservativeScore));
    const shift = minScore < 0 ? Math.abs(minScore) + 1 : 0;
    let totalConservativeScore = steps.reduce(
      (sum, s) => sum + (s.conservativeScore + shift),
      0,
    );
    // Guard against totalConservativeScore = 0 (all scores identical after shift)
    if (totalConservativeScore === 0) totalConservativeScore = 1;

    // Step 2: Calculate form factors and raw probabilities
    for (const step of steps) {
      const { competitor, recentRaces } = competitorsWithStats.find(
        (c) => c.competitor.id === step.competitorId,
      )!;

      // Calculate average recent rank
      step.avgRecentRank =
        recentRaces.length > 0
          ? recentRaces.reduce((sum, r) => sum + r.rank12, 0) /
            recentRaces.length
          : 6.5; // Default to mid-rank if no races

      // Use competitor's stored formFactor (updated after each race)
      // This ensures consistency and uses the weighted calculation
      // Falls back to calculated value if not set
      step.formFactor =
        competitor.formFactor !== undefined &&
        competitor.formFactor !== null &&
        competitor.formFactor >= DEFAULT_ODDS_PARAMS.formFactorMin &&
        competitor.formFactor <= DEFAULT_ODDS_PARAMS.formFactorMax
          ? competitor.formFactor
          : this.calculateFormFactor(
              step.avgRecentRank,
              step.winStreak,
              step.recentRaceCount,
            );

      // Calculate raw probability using shifted scores
      step.rawProbability =
        (step.conservativeScore + shift) / totalConservativeScore;
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
    // First, get all conservative scores for tier calculation
    const allConservativeScores = steps.map((s) => s.conservativeScore);
    allConservativeScores.sort((a, b) => a - b);

    for (const step of steps) {
      // Odd = BASE / probability
      step.odd =
        DEFAULT_ODDS_PARAMS.baseMultiplier / step.normalizedProbability;

      // Apply min/max bounds
      step.cappedOdd = Math.max(
        DEFAULT_ODDS_PARAMS.minOdd,
        Math.min(step.odd, DEFAULT_ODDS_PARAMS.maxOdd),
      );

      // Calculate position-specific odds
      const positionFactors = this.getPositionFactors(
        step.conservativeScore,
        allConservativeScores,
      );

      // Position odds: base / (probability * position_factor)
      // Higher factor = higher probability of that position = lower odds
      const rawOddFirst =
        DEFAULT_ODDS_PARAMS.baseMultiplier /
        (step.normalizedProbability * positionFactors.first);
      const rawOddSecond =
        DEFAULT_ODDS_PARAMS.baseMultiplier /
        (step.normalizedProbability * positionFactors.second);
      const rawOddThird =
        DEFAULT_ODDS_PARAMS.baseMultiplier /
        (step.normalizedProbability * positionFactors.third);

      // Apply min/max bounds to position odds
      step.oddFirst = Math.max(
        DEFAULT_ODDS_PARAMS.minOdd,
        Math.min(rawOddFirst, DEFAULT_ODDS_PARAMS.maxOdd),
      );
      step.oddSecond = Math.max(
        DEFAULT_ODDS_PARAMS.minOdd,
        Math.min(rawOddSecond, DEFAULT_ODDS_PARAMS.maxOdd),
      );
      step.oddThird = Math.max(
        DEFAULT_ODDS_PARAMS.minOdd,
        Math.min(rawOddThird, DEFAULT_ODDS_PARAMS.maxOdd),
      );
    }

    return steps;
  }

  /**
   * Get position probability factors based on player tier
   *
   * Strong players (high conservative score) are more likely to be 1st
   * Weak players (low conservative score) are more likely to be 3rd
   */
  private getPositionFactors(
    conservativeScore: number,
    allScores: number[],
  ): { first: number; second: number; third: number } {
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const index = sortedScores.indexOf(conservativeScore);
    const percentile = index / (sortedScores.length - 1 || 1);

    if (percentile >= POSITION_FACTORS.THRESHOLDS.topTierPercentile) {
      return POSITION_FACTORS.TOP_TIER;
    } else if (percentile <= POSITION_FACTORS.THRESHOLDS.bottomTierPercentile) {
      return POSITION_FACTORS.BOTTOM_TIER;
    } else {
      return POSITION_FACTORS.MID_TIER;
    }
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
        oddFirst: odd.oddFirst,
        oddSecond: odd.oddSecond,
        oddThird: odd.oddThird,
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
      oddFirst: entity.oddFirst,
      oddSecond: entity.oddSecond,
      oddThird: entity.oddThird,
      probability: entity.metadata.probability,
      formFactor: entity.metadata.formFactor,
      isEligible: true,
      metadata: entity.metadata,
    }));
  }

  /**
   * Get eligible competitors for a betting week
   *
   * Returns competitors who meet all eligibility criteria:
   * 1. MIN_LIFETIME_RACES total races (calibration)
   * 2. MIN_RECENT_RACES in last RECENT_WINDOW_DAYS (activity)
   * 3. MIN_RACES_THIS_WEEK in current betting week
   *
   * @param weekId - Betting week UUID
   * @returns List of eligible and ineligible competitors with their stats
   */
  async getEligibleCompetitors(weekId: string): Promise<{
    weekId: string;
    eligibleCount: number;
    totalCount: number;
    eligibilityRules: {
      minLifetimeRaces: number;
      minRecentRaces: number;
      recentWindowDays: number;
      minRacesThisWeek: number;
    };
    competitors: Array<{
      id: string;
      firstName: string;
      lastName: string;
      rating: number;
      rd: number;
      racesThisWeek: number;
      totalLifetimeRaces: number;
      recentRacesIn14Days: number;
      isEligible: boolean;
      ineligibilityReason: IneligibilityReason;
    }>;
  }> {
    // Fetch betting week
    const week = await this.bettingWeekRepository.findOne({
      where: { id: weekId },
    });

    if (!week) {
      throw new Error(`Betting week ${weekId} not found`);
    }

    // Get all competitors with stats
    const competitorsWithStats = await this.fetchCompetitorsWithStats(week);

    // Map to response format
    const competitors = await Promise.all(
      competitorsWithStats.map(async (c) => {
        // Get races this week count
        const racesThisWeek = await this.raceResultRepository
          .createQueryBuilder('result')
          .innerJoin('result.race', 'race')
          .where('result.competitorId = :competitorId', {
            competitorId: c.competitor.id,
          })
          .andWhere('race.date >= :startDate', { startDate: week.startDate })
          .andWhere('race.date <= :endDate', { endDate: week.endDate })
          .getCount();

        return {
          id: c.competitor.id,
          firstName: c.competitor.firstName,
          lastName: c.competitor.lastName,
          rating: c.competitor.rating,
          rd: c.competitor.rd,
          racesThisWeek,
          totalLifetimeRaces: c.competitor.totalLifetimeRaces,
          recentRacesIn14Days: c.recentRacesIn14Days ?? 0,
          isEligible: c.isEligible,
          ineligibilityReason: c.ineligibilityReason ?? null,
        };
      }),
    );

    const eligibleCount = competitors.filter((c) => c.isEligible).length;

    this.logger.log(
      `Found ${eligibleCount}/${competitors.length} eligible competitors for week ${weekId}`,
    );

    return {
      weekId,
      eligibleCount,
      totalCount: competitors.length,
      eligibilityRules: {
        minLifetimeRaces: ELIGIBILITY_RULES.MIN_LIFETIME_RACES,
        minRecentRaces: ELIGIBILITY_RULES.MIN_RECENT_RACES,
        recentWindowDays: ELIGIBILITY_RULES.RECENT_WINDOW_DAYS,
        minRacesThisWeek: ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK,
      },
      competitors,
    };
  }
}
