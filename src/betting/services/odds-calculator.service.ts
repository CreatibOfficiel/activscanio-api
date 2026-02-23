/**
 * OddsCalculatorService
 *
 * Responsible for calculating betting odds for competitors in a given week.
 *
 * Architecture:
 * - Pure calculation logic (no side effects beyond DB save)
 * - Configurable parameters (via config file)
 * - Detailed intermediate steps (for debugging)
 * - Type-safe throughout
 *
 * Calculation Flow:
 * 1. Fetch all competitors + recent race data
 * 2. Filter eligible competitors (lifetime calibration + 30-day activity)
 * 3. Compute Plackett-Luce strengths via Glicko-2 g(phi) dampening
 * 4. Run Monte Carlo simulation (50K) for P(1st), P(2nd), P(3rd)
 * 5. Convert probabilities to decimal odds
 * 6. Apply min/max capping
 * 7. Save to database
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
  ELIGIBILITY_RULES,
  ODDS_LOGGER_CONFIG,
  MONTE_CARLO_CONFIG,
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
   */
  async calculateOddsForWeek(
    bettingWeekId: string,
  ): Promise<OddsCalculationResult> {
    this.logger.log(`Starting odds calculation for week ${bettingWeekId}`);

    const week = await this.bettingWeekRepository.findOne({
      where: { id: bettingWeekId },
    });

    if (!week) {
      throw new Error(`Betting week ${bettingWeekId} not found`);
    }

    const competitorsWithStats = await this.fetchCompetitorsWithStats();

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

    const calculationSteps = this.calculateOddsSteps(eligibleCompetitors);

    const odds: CompetitorOdd[] = calculationSteps.map((step) => ({
      competitorId: step.competitorId,
      competitorName: step.competitorName,
      oddFirst: step.oddFirst,
      oddSecond: step.oddSecond,
      oddThird: step.oddThird,
      probability: step.normalizedProbability,
      isEligible: step.isEligible,
      metadata: {
        elo: step.conservativeScore,
        rd: step.rd,
        recentWins: step.recentRaceCount,
        winStreak: step.winStreak,
        raceCount: step.recentRaceCount,
        avgRank: step.avgRecentRank,
        formFactor: 1.0,
        probability: step.normalizedProbability,
        mu: step.mu,
        phi: step.phi,
        plStrength: step.plStrength,
      },
    }));

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
   *
   * No longer requires a BettingWeek — eligibility is based on
   * lifetime races and a 30-day rolling window only.
   */
  private async fetchCompetitorsWithStats(): Promise<CompetitorWithStats[]> {
    const competitors = await this.competitorRepository.find();

    const competitorsWithStats = await Promise.all(
      competitors.map(async (competitor) => {
        // Get recent races for metadata
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

        const { isEligible, reason, recentRacesInWindow } =
          this.checkCompetitorEligibility(competitor, recentRacePerformances);

        return {
          competitor,
          recentRaces: recentRacePerformances,
          isEligible,
          ineligibilityReason: reason,
          calibrationProgress: competitor.totalLifetimeRaces,
          recentRacesInWindow,
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
   * 2. Recent activity: Must have >= MIN_RECENT_RACES in the last RECENT_WINDOW_DAYS (30 days)
   */
  private checkCompetitorEligibility(
    competitor: Competitor,
    recentRaces: RecentRacePerformance[],
  ): {
    isEligible: boolean;
    reason: IneligibilityReason;
    recentRacesInWindow: number;
  } {
    // Rule 1: Calibration check (lifetime races)
    if (competitor.totalLifetimeRaces < ELIGIBILITY_RULES.MIN_LIFETIME_RACES) {
      return {
        isEligible: false,
        reason: 'calibrating',
        recentRacesInWindow: 0,
      };
    }

    // Rule 2: Recent activity check (rolling 30-day window)
    const windowStart = new Date();
    windowStart.setDate(
      windowStart.getDate() - ELIGIBILITY_RULES.RECENT_WINDOW_DAYS,
    );

    const recentRacesInWindow = recentRaces.filter(
      (r) => new Date(r.date) >= windowStart,
    ).length;

    if (recentRacesInWindow < ELIGIBILITY_RULES.MIN_RECENT_RACES) {
      return {
        isEligible: false,
        reason: 'inactive',
        recentRacesInWindow,
      };
    }

    return {
      isEligible: true,
      reason: null,
      recentRacesInWindow,
    };
  }

  /**
   * Calculate odds using Plackett-Luce strengths + Monte Carlo simulation
   */
  private calculateOddsSteps(
    competitorsWithStats: CompetitorWithStats[],
  ): OddsCalculationStep[] {
    const { GLICKO_SCALE, INCORPORATE_RD, NUM_SIMULATIONS } =
      MONTE_CARLO_CONFIG;

    // Step 1: Compute Plackett-Luce strengths
    const strengths: Array<{
      competitorId: string;
      alpha: number;
      step: OddsCalculationStep;
    }> = [];

    for (const { competitor, recentRaces } of competitorsWithStats) {
      const mu = (competitor.rating - 1500) / GLICKO_SCALE;
      const phi = competitor.rd / GLICKO_SCALE;

      // g(phi) dampening from Glicko-2
      const gPhi = INCORPORATE_RD
        ? 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
        : 1;

      const alpha = Math.exp(mu * gPhi);

      // Calculate average recent rank (for metadata)
      const avgRecentRank =
        recentRaces.length > 0
          ? recentRaces.reduce((sum, r) => sum + r.rank12, 0) /
            recentRaces.length
          : 6.5;

      const step: OddsCalculationStep = {
        competitorId: competitor.id,
        competitorName: `${competitor.firstName} ${competitor.lastName}`,
        rating: competitor.rating,
        rd: competitor.rd,
        conservativeScore: competitor.rating - 2 * competitor.rd,
        mu,
        phi,
        plStrength: alpha,
        recentRaceCount: recentRaces.length,
        avgRecentRank,
        winStreak: competitor.winStreak,
        formFactor: 1.0,
        rawProbability: 0,
        adjustedProbability: 0,
        normalizedProbability: 0,
        pFirst: 0,
        pSecond: 0,
        pThird: 0,
        oddFirst: 0,
        oddSecond: 0,
        oddThird: 0,
        isEligible: true,
        calculatedAt: new Date(),
      };

      strengths.push({ competitorId: competitor.id, alpha, step });
    }

    // Step 2: Win probabilities (softmax)
    const totalAlpha = strengths.reduce((sum, s) => sum + s.alpha, 0);
    for (const s of strengths) {
      const pWin = s.alpha / totalAlpha;
      s.step.rawProbability = pWin;
      s.step.adjustedProbability = pWin;
      s.step.normalizedProbability = pWin;
    }

    // Step 3: Monte Carlo simulation for podium probabilities
    const mcResults = this.runMonteCarloSimulation(
      strengths.map((s) => ({ id: s.competitorId, alpha: s.alpha })),
      NUM_SIMULATIONS,
    );

    // Step 4: Convert to odds
    for (const s of strengths) {
      const mc = mcResults.get(s.competitorId)!;
      s.step.pFirst = mc.first / NUM_SIMULATIONS;
      s.step.pSecond = mc.second / NUM_SIMULATIONS;
      s.step.pThird = mc.third / NUM_SIMULATIONS;

      // Decimal odds = 1 / probability, clamped
      const clamp = (v: number) =>
        Math.max(
          DEFAULT_ODDS_PARAMS.minOdd,
          Math.min(v, DEFAULT_ODDS_PARAMS.maxOdd),
        );

      s.step.oddFirst = clamp(1 / s.step.pFirst);
      s.step.oddSecond = clamp(1 / s.step.pSecond);
      s.step.oddThird = clamp(1 / s.step.pThird);

    }

    return strengths.map((s) => s.step);
  }

  /**
   * Run Monte Carlo simulation to estimate podium probabilities
   *
   * Uses Plackett-Luce sampling: for each position, draw a competitor
   * proportionally to their alpha, then remove them from the pool.
   */
  private runMonteCarloSimulation(
    competitors: Array<{ id: string; alpha: number }>,
    numSimulations: number,
  ): Map<string, { first: number; second: number; third: number }> {
    const counts = new Map<
      string,
      { first: number; second: number; third: number }
    >();

    for (const c of competitors) {
      counts.set(c.id, { first: 0, second: 0, third: 0 });
    }

    const positionKeys = ['first', 'second', 'third'] as const;
    const n = competitors.length;

    for (let sim = 0; sim < numSimulations; sim++) {
      // Copy alphas for this simulation (we'll zero out selected ones)
      const alphas = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        alphas[i] = competitors[i].alpha;
      }

      let totalAlpha = alphas.reduce((sum, a) => sum + a, 0);

      const positions = Math.min(MONTE_CARLO_CONFIG.PODIUM_SIZE, n);
      for (let pos = 0; pos < positions; pos++) {
        // Draw a competitor proportionally to alpha
        const rand = Math.random() * totalAlpha;
        let cumulative = 0;
        let selectedIdx = n - 1; // Fallback to last

        for (let i = 0; i < n; i++) {
          if (alphas[i] === 0) continue;
          cumulative += alphas[i];
          if (cumulative >= rand) {
            selectedIdx = i;
            break;
          }
        }

        // Increment counter
        counts.get(competitors[selectedIdx].id)![positionKeys[pos]]++;

        // Remove from pool
        totalAlpha -= alphas[selectedIdx];
        alphas[selectedIdx] = 0;
      }
    }

    return counts;
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
    return odds.reduce((sum, o) => sum + o.oddFirst, 0) / odds.length;
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
      oddFirst: entity.oddFirst,
      oddSecond: entity.oddSecond,
      oddThird: entity.oddThird,
      probability: entity.metadata.probability,
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
   */
  async getEligibleCompetitors(weekId: string): Promise<{
    weekId: string;
    eligibleCount: number;
    totalCount: number;
    eligibilityRules: {
      minLifetimeRaces: number;
      minRecentRaces: number;
      recentWindowDays: number;
    };
    competitors: Array<{
      id: string;
      firstName: string;
      lastName: string;
      rating: number;
      rd: number;
      totalLifetimeRaces: number;
      recentRacesInWindow: number;
      isEligible: boolean;
      ineligibilityReason: IneligibilityReason;
    }>;
  }> {
    const week = await this.bettingWeekRepository.findOne({
      where: { id: weekId },
    });

    if (!week) {
      throw new Error(`Betting week ${weekId} not found`);
    }

    const competitorsWithStats = await this.fetchCompetitorsWithStats();

    const competitors = competitorsWithStats.map((c) => ({
      id: c.competitor.id,
      firstName: c.competitor.firstName,
      lastName: c.competitor.lastName,
      rating: c.competitor.rating,
      rd: c.competitor.rd,
      totalLifetimeRaces: c.competitor.totalLifetimeRaces,
      recentRacesInWindow: c.recentRacesInWindow ?? 0,
      isEligible: c.isEligible,
      ineligibilityReason: c.ineligibilityReason ?? null,
    }));

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
      },
      competitors,
    };
  }
}
