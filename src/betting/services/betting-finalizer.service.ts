/**
 * BettingFinalizerService
 *
 * Responsible for finalizing betting weeks and calculating points.
 *
 * Key Responsibilities:
 * - Calculate points for each bet based on podium results
 * - Apply perfect podium bonus (2x points)
 * - Apply x2 boost multiplier to selected picks
 * - Update bet records with points earned
 * - Update bettor rankings for monthly leaderboard
 *
 * Calculation Rules:
 * - Correct pick: points = oddAtBet * (hasBoost ? 2 : 1)
 * - Incorrect pick: 0 points
 * - Perfect podium (all 3 correct): total points * 2
 *
 * Design Principles:
 * - Idempotent (safe to run multiple times)
 * - Transaction-safe (atomic operations)
 * - Detailed logging for audit trail
 * - Type-safe throughout
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BettingWeek, BettingWeekStatus } from '../entities/betting-week.entity';
import { Bet } from '../entities/bet.entity';
import { BetPick } from '../entities/bet-pick.entity';
import { BettorRanking } from '../entities/bettor-ranking.entity';
import {
  DEFAULT_SCORING_PARAMS,
  SCORING_LOGGER_CONFIG,
} from '../config/betting-scoring.config';

/**
 * Podium result for a week
 */
interface PodiumResult {
  firstId: string;
  secondId: string;
  thirdId: string;
}

/**
 * Calculation result for a single pick
 */
interface PickCalculation {
  pickId: string;
  competitorId: string;
  position: string;
  isCorrect: boolean;
  oddAtBet: number;
  hasBoost: boolean;
  pointsEarned: number;
}

/**
 * Calculation result for a complete bet
 */
interface BetCalculation {
  betId: string;
  userId: string;
  picks: PickCalculation[];
  totalPointsBeforeBonus: number;
  isPerfectPodium: boolean;
  perfectPodiumBonus: number;
  finalPoints: number;
}

/**
 * Week finalization result
 */
interface FinalizationResult {
  weekId: string;
  weekNumber: number;
  year: number;
  month: number;
  podium: PodiumResult;
  processedBets: number;
  totalPointsDistributed: number;
  calculations: BetCalculation[];
  finalizedAt: Date;
}

@Injectable()
export class BettingFinalizerService {
  private readonly logger = new Logger(BettingFinalizerService.name);

  constructor(
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BetPick)
    private readonly betPickRepository: Repository<BetPick>,
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
  ) {}

  /**
   * Finalize a betting week
   *
   * This method:
   * 1. Fetches the week and validates it has a podium
   * 2. Fetches all bets for the week
   * 3. Calculates points for each bet
   * 4. Updates bet records
   * 5. Updates bettor rankings
   *
   * @param weekId - The week to finalize
   * @returns Complete finalization result with all calculations
   */
  async finalizeWeek(weekId: string): Promise<FinalizationResult> {
    this.logger.log(`Starting finalization for week ${weekId}`);

    // 1. Fetch and validate week data
    const week = await this.fetchWeekData(weekId);

    // 2. Extract podium
    const podium: PodiumResult = {
      firstId: week.podiumFirstId!,
      secondId: week.podiumSecondId!,
      thirdId: week.podiumThirdId!,
    };

    this.logger.log(
      `Podium for week ${week.weekNumber}/${week.year}: [${podium.firstId}, ${podium.secondId}, ${podium.thirdId}]`,
    );

    // 3. Fetch all bets for this week
    const bets = await this.betRepository.find({
      where: { bettingWeekId: weekId },
      relations: ['picks'],
    });

    if (bets.length === 0) {
      this.logger.warn(`No bets found for week ${weekId}`);
      return {
        weekId,
        weekNumber: week.weekNumber,
        year: week.year,
        month: week.month,
        podium,
        processedBets: 0,
        totalPointsDistributed: 0,
        calculations: [],
        finalizedAt: new Date(),
      };
    }

    this.logger.log(`Processing ${bets.length} bets...`);

    // 4. Calculate points for all bets
    const calculations = await this.processBets(bets, podium);

    // 5. Update bettor rankings
    await this.updateBettorRankings(week.month, week.year, calculations);

    // 6. Calculate stats
    const totalPointsDistributed = calculations.reduce(
      (sum, calc) => sum + calc.finalPoints,
      0,
    );

    const result: FinalizationResult = {
      weekId,
      weekNumber: week.weekNumber,
      year: week.year,
      month: week.month,
      podium,
      processedBets: bets.length,
      totalPointsDistributed,
      calculations: SCORING_LOGGER_CONFIG.logDetailedCalculations
        ? calculations
        : [],
      finalizedAt: new Date(),
    };

    this.logger.log(
      `Finalization complete: ${bets.length} bets processed, ${totalPointsDistributed.toFixed(2)} points distributed`,
    );

    return result;
  }

  /**
   * Fetch and validate week data
   */
  private async fetchWeekData(weekId: string): Promise<BettingWeek> {
    const week = await this.bettingWeekRepository.findOne({
      where: { id: weekId },
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
    });

    if (!week) {
      throw new Error(`Betting week ${weekId} not found`);
    }

    if (!week.podiumFirstId || !week.podiumSecondId || !week.podiumThirdId) {
      throw new Error(
        `Week ${weekId} does not have a complete podium. Cannot finalize.`,
      );
    }

    if (week.status !== BettingWeekStatus.FINALIZED) {
      throw new Error(
        `Week ${weekId} is not in FINALIZED status (current: ${week.status})`,
      );
    }

    return week;
  }

  /**
   * Process all bets and calculate points
   */
  private async processBets(
    bets: Bet[],
    podium: PodiumResult,
  ): Promise<BetCalculation[]> {
    const calculations: BetCalculation[] = [];

    // Process each bet in a transaction
    for (const bet of bets) {
      const calculation = await this.calculateBetPoints(bet, podium);
      calculations.push(calculation);

      // Update bet record
      await this.updateBetRecord(bet, calculation);

      if (SCORING_LOGGER_CONFIG.logFinalPoints) {
        this.logger.log(
          `Bet ${bet.id} (User ${bet.userId}): ${calculation.finalPoints.toFixed(2)} points ${calculation.isPerfectPodium ? '(PERFECT PODIUM!)' : ''}`,
        );
      }
    }

    return calculations;
  }

  /**
   * Calculate points for a single bet
   */
  private calculateBetPoints(
    bet: Bet,
    podium: PodiumResult,
  ): BetCalculation {
    const pickCalculations: PickCalculation[] = [];

    // Check each pick
    for (const pick of bet.picks) {
      const isCorrect = this.isPickCorrect(pick, podium);

      // Calculate points for this pick
      let pointsEarned = 0;
      if (isCorrect) {
        pointsEarned = pick.oddAtBet;

        // Apply boost if enabled
        if (pick.hasBoost) {
          pointsEarned *= DEFAULT_SCORING_PARAMS.boostMultiplier;
        }

        // Apply minimum points guarantee
        pointsEarned = Math.max(
          pointsEarned,
          DEFAULT_SCORING_PARAMS.minPointsPerCorrectPick,
        );
      } else {
        pointsEarned = DEFAULT_SCORING_PARAMS.incorrectPickPoints;
      }

      pickCalculations.push({
        pickId: pick.id,
        competitorId: pick.competitorId,
        position: pick.position,
        isCorrect,
        oddAtBet: pick.oddAtBet,
        hasBoost: pick.hasBoost,
        pointsEarned,
      });
    }

    // Calculate total points before bonus
    const totalPointsBeforeBonus = pickCalculations.reduce(
      (sum, calc) => sum + calc.pointsEarned,
      0,
    );

    // Check if perfect podium (all 3 correct)
    const isPerfectPodium = pickCalculations.every((calc) => calc.isCorrect);

    // Apply perfect podium bonus
    let perfectPodiumBonus = 0;
    let finalPoints = totalPointsBeforeBonus;

    if (isPerfectPodium) {
      perfectPodiumBonus =
        totalPointsBeforeBonus * (DEFAULT_SCORING_PARAMS.perfectPodiumBonus - 1);
      finalPoints =
        totalPointsBeforeBonus * DEFAULT_SCORING_PARAMS.perfectPodiumBonus;
    }

    return {
      betId: bet.id,
      userId: bet.userId,
      picks: pickCalculations,
      totalPointsBeforeBonus,
      isPerfectPodium,
      perfectPodiumBonus,
      finalPoints,
    };
  }

  /**
   * Check if a pick is correct
   */
  private isPickCorrect(pick: BetPick, podium: PodiumResult): boolean {
    switch (pick.position) {
      case 'first':
        return pick.competitorId === podium.firstId;
      case 'second':
        return pick.competitorId === podium.secondId;
      case 'third':
        return pick.competitorId === podium.thirdId;
      default:
        return false;
    }
  }

  /**
   * Update bet record with calculated points
   */
  private async updateBetRecord(
    bet: Bet,
    calculation: BetCalculation,
  ): Promise<void> {
    // Update bet
    bet.isFinalized = true;
    bet.pointsEarned = calculation.finalPoints;
    await this.betRepository.save(bet);

    // Update individual picks
    for (const pickCalc of calculation.picks) {
      const pick = bet.picks.find((p) => p.id === pickCalc.pickId);
      if (pick) {
        pick.isCorrect = pickCalc.isCorrect;
        pick.pointsEarned = pickCalc.pointsEarned;
        await this.betPickRepository.save(pick);
      }
    }
  }

  /**
   * Update bettor rankings for the month
   */
  private async updateBettorRankings(
    month: number,
    year: number,
    calculations: BetCalculation[],
  ): Promise<void> {
    this.logger.log(`Updating bettor rankings for ${month}/${year}...`);

    // Group points by user
    const userPoints = new Map<string, number>();

    for (const calc of calculations) {
      const currentPoints = userPoints.get(calc.userId) || 0;
      userPoints.set(calc.userId, currentPoints + calc.finalPoints);
    }

    // Update or create ranking records
    for (const [userId, points] of userPoints.entries()) {
      await this.upsertBettorRanking(userId, month, year, points);
    }

    if (SCORING_LOGGER_CONFIG.logRankingUpdates) {
      this.logger.log(
        `Updated rankings for ${userPoints.size} users in ${month}/${year}`,
      );
    }
  }

  /**
   * Create or update bettor ranking
   */
  private async upsertBettorRanking(
    userId: string,
    month: number,
    year: number,
    pointsToAdd: number,
  ): Promise<void> {
    let ranking = await this.bettorRankingRepository.findOne({
      where: { userId, month, year },
    });

    if (!ranking) {
      // Create new ranking
      ranking = this.bettorRankingRepository.create({
        userId,
        month,
        year,
        totalPoints: pointsToAdd,
        rank: 0, // Will be recalculated
      });
    } else {
      // Update existing ranking
      ranking.totalPoints += pointsToAdd;
    }

    await this.bettorRankingRepository.save(ranking);
  }

  /**
   * Recalculate all ranks for a given month
   *
   * This should be called after all bets are finalized to assign proper ranks.
   * Ranks are based on total points (highest = rank 1).
   */
  async recalculateRanks(month: number, year: number): Promise<void> {
    this.logger.log(`Recalculating ranks for ${month}/${year}...`);

    // Fetch all rankings for this month, sorted by points desc
    const rankings = await this.bettorRankingRepository.find({
      where: { month, year },
      order: { totalPoints: 'DESC' },
    });

    // Assign ranks
    let currentRank = 1;
    for (const ranking of rankings) {
      ranking.rank = currentRank++;
      await this.bettorRankingRepository.save(ranking);
    }

    this.logger.log(
      `Ranks recalculated for ${rankings.length} users in ${month}/${year}`,
    );
  }
}
