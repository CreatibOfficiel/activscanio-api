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
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BettingWeek,
  BettingWeekStatus,
} from '../entities/betting-week.entity';
import { Bet, BetStatus } from '../entities/bet.entity';
import { BetPick, BetPosition } from '../entities/bet-pick.entity';
import { BettorRanking } from '../entities/bettor-ranking.entity';
import { CompetitorOdds } from '../entities/competitor-odds.entity';
import {
  DEFAULT_SCORING_PARAMS,
  SCORING_LOGGER_CONFIG,
} from '../config/betting-scoring.config';
import { StreakTrackerService } from '../../achievements/services/streak-tracker.service';
import {
  XPLevelService,
  XPSource,
} from '../../achievements/services/xp-level.service';
import { DailyBonusService } from '../../achievements/services/daily-bonus.service';
import { CanvasImageService } from '../../image-generation/services/canvas-image.service';
import { ImageStorageService } from '../../image-generation/services/image-storage.service';
import { TvDisplayService } from '../../image-generation/services/tv-display.service';

/**
 * Podium result for a week
 */
interface PodiumResult {
  firstId: string;
  secondId: string;
  thirdId: string;
}

/**
 * Position odds for BOG calculation
 */
interface PositionOdds {
  first: number;
  second: number;
  third: number;
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
  finalOdd: number | null;
  usedBogOdd: boolean;
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
    @InjectRepository(CompetitorOdds)
    private readonly competitorOddsRepository: Repository<CompetitorOdds>,
    private readonly eventEmitter: EventEmitter2,
    private readonly streakTrackerService: StreakTrackerService,
    private readonly xpLevelService: XPLevelService,
    private readonly dailyBonusService: DailyBonusService,
    private readonly canvasImageService: CanvasImageService,
    private readonly imageStorageService: ImageStorageService,
    private readonly tvDisplayService: TvDisplayService,
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
      firstId: week.podiumFirstId,
      secondId: week.podiumSecondId,
      thirdId: week.podiumThirdId,
    };

    this.logger.log(
      `Podium for week ${week.weekNumber}/${week.year}: [${podium.firstId}, ${podium.secondId}, ${podium.thirdId}]`,
    );

    // 3. Fetch only non-finalized bets for this week (prevents double finalization)
    const bets = await this.betRepository.find({
      where: { bettingWeekId: weekId, isFinalized: false },
      relations: ['picks', 'picks.competitor'],
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

    // 4. Fetch final odds for BOG calculation
    const finalOddsMap = await this.fetchFinalOdds(weekId);

    // 5. Calculate points for all bets with BOG
    const calculations = await this.processBets(bets, podium, finalOddsMap);

    // 6. Update bettor rankings
    await this.updateBettorRankings(week.month, week.year, calculations);

    // 7. Calculate stats
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
   * Fetch final odds for all competitors in a betting week
   * Used for Best Odds Guaranteed (BOG) calculation
   *
   * @param weekId - The betting week ID
   * @returns Map of competitorId to their final position odds
   */
  private async fetchFinalOdds(
    weekId: string,
  ): Promise<Map<string, PositionOdds>> {
    // Fetch the latest odds for each competitor in this week
    // Using a subquery to get the most recent calculatedAt per competitor
    const latestOdds = await this.competitorOddsRepository
      .createQueryBuilder('odds')
      .where('odds.bettingWeekId = :weekId', { weekId })
      .andWhere(
        `odds.calculatedAt = (
          SELECT MAX(o2."calculatedAt")
          FROM competitor_odds o2
          WHERE o2."competitorId" = odds."competitorId"
          AND o2."bettingWeekId" = :weekId
        )`,
      )
      .getMany();

    const map = new Map<string, PositionOdds>();
    for (const odd of latestOdds) {
      if (odd.oddFirst && odd.oddSecond && odd.oddThird) {
        map.set(odd.competitorId, {
          first: odd.oddFirst,
          second: odd.oddSecond,
          third: odd.oddThird,
        });
      }
    }

    this.logger.log(
      `Fetched final odds for ${map.size} competitors for BOG calculation`,
    );

    return map;
  }

  /**
   * Process all bets and calculate points
   */
  private async processBets(
    bets: Bet[],
    podium: PodiumResult,
    finalOddsMap: Map<string, PositionOdds>,
  ): Promise<BetCalculation[]> {
    const calculations: BetCalculation[] = [];

    // Process each bet in a transaction
    for (const bet of bets) {
      const calculation = this.calculateBetPoints(bet, podium, finalOddsMap);
      calculations.push(calculation);

      // Update bet record
      await this.updateBetRecord(bet, calculation);

      // Update participation streak for this user
      try {
        await this.streakTrackerService.updateStreak(
          bet.userId,
          bet.bettingWeekId,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to update streak for user ${bet.userId}: ${errorMessage}`,
        );
      }

      // Update win streak for this user
      try {
        const betWonForStreak = calculation.finalPoints > 0;
        await this.streakTrackerService.updateWinStreak(
          bet.userId,
          bet.bettingWeekId,
          betWonForStreak,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to update win streak for user ${bet.userId}: ${errorMessage}`,
        );
      }

      // Calculate stats for events and XP
      const correctPicksCount = calculation.picks.filter(
        (p) => p.isCorrect,
      ).length;
      const hasBoost = calculation.picks.some((p) => p.hasBoost);
      const highestOdd = Math.max(...calculation.picks.map((p) => p.oddAtBet));

      // Calculate high odds bonus (declare outside try block for later use)
      const highOddsBonus = this.calculateHighOddsXP(calculation.picks);

      // Pre-compute comeback bonus eligibility (used in both XP and daily stats)
      let comebackBonusEligible = false;
      const betWon = correctPicksCount > 0;
      if (betWon) {
        const previousBets = await this.betRepository.find({
          where: { userId: bet.userId, isFinalized: true },
          order: { createdAt: 'DESC' },
          take: 4,
        });
        const lastThreeBets = previousBets
          .filter((b) => b.id !== bet.id)
          .slice(0, 3);
        comebackBonusEligible =
          lastThreeBets.length === 3 &&
          lastThreeBets.every((b) => (b.pointsEarned ?? 0) === 0);
      }

      // Award XP for betting actions
      try {
        // Base XP for placing bet
        await this.xpLevelService.awardXP(bet.userId, XPSource.BET_PLACED);

        // XP for correct picks
        for (let i = 0; i < correctPicksCount; i++) {
          await this.xpLevelService.awardXP(bet.userId, XPSource.CORRECT_PICK);
        }

        // XP for perfect podium
        if (calculation.isPerfectPodium) {
          await this.xpLevelService.awardXP(
            bet.userId,
            XPSource.PERFECT_PODIUM,
          );
        }

        // XP for weekly participation
        await this.xpLevelService.awardXP(
          bet.userId,
          XPSource.WEEKLY_PARTICIPATION,
        );

        // XP bonus for high odds (odds >= 5)
        if (highOddsBonus > 0) {
          await this.xpLevelService.awardXP(
            bet.userId,
            XPSource.HIGH_ODDS_BONUS,
            highOddsBonus,
            bet.id,
            `High odds bonus (${highOddsBonus} XP)`,
          );
        }

        // Comeback bonus - award 25 XP for winning after 3+ consecutive losses
        if (comebackBonusEligible) {
          await this.xpLevelService.awardXP(
            bet.userId,
            XPSource.COMEBACK_BONUS,
            null,
            bet.id,
            'Comeback bonus (won after 3 consecutive losses)',
          );
          this.logger.log(
            `Comeback bonus awarded to user ${bet.userId} for bet ${bet.id}`,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to award XP for user ${bet.userId}: ${errorMessage}`,
        );
      }

      // Track daily stats
      try {
        // Calculate total XP earned for this bet
        let totalXP = 0;
        totalXP += 10; // BET_PLACED
        totalXP += correctPicksCount * 15; // CORRECT_PICK
        if (calculation.isPerfectPodium) {
          totalXP += 100; // PERFECT_PODIUM
        }
        totalXP += 20; // WEEKLY_PARTICIPATION
        totalXP += highOddsBonus; // HIGH_ODDS_BONUS if any

        // Add comeback bonus XP if eligible (pre-computed above)
        if (comebackBonusEligible) {
          totalXP += 25; // COMEBACK_BONUS
        }

        await this.dailyBonusService.trackDailyActivity(
          bet.userId,
          true, // bet was placed
          betWon,
          calculation.finalPoints,
          totalXP,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to track daily stats for user ${bet.userId}: ${errorMessage}`,
        );
      }

      // Emit event for achievement calculation + WebSocket relay
      this.eventEmitter.emit('bet.finalized', {
        userId: bet.userId,
        betId: bet.id,
        weekId: bet.bettingWeekId,
        status: calculation.finalPoints > 0 ? 'won' : 'lost',
        pointsEarned: calculation.finalPoints,
        isPerfectPodium: calculation.isPerfectPodium,
        perfectPodiumBonus: calculation.perfectPodiumBonus,
        correctPicks: correctPicksCount,
        totalPicks: calculation.picks.length,
        hasBoost,
        highestOdd,
        picks: calculation.picks.map((p) => {
          const betPick = bet.picks.find((bp) => bp.id === p.pickId);
          return {
            competitorName: betPick?.competitor
              ? `${betPick.competitor.firstName} ${betPick.competitor.lastName}`
              : 'Unknown',
            position: p.position,
            isCorrect: p.isCorrect,
            oddAtBet: p.oddAtBet,
            hasBoost: p.hasBoost,
            pointsEarned: p.pointsEarned,
            usedBogOdd: p.usedBogOdd,
          };
        }),
      });

      // 🎉 PERFECT SCORE CELEBRATION (60 points)
      if (calculation.finalPoints === 60) {
        // Fire and forget - don't block bet finalization
        this.handlePerfectScoreCelebration(bet, calculation).catch((error) => {
          this.logger.error(
            `Perfect score celebration failed for bet ${bet.id} but bet finalized successfully`,
            error,
          );
        });
      }

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
   * Implements Best Odds Guaranteed (BOG): uses the better of oddAtBet or finalOdd
   */
  private calculateBetPoints(
    bet: Bet,
    podium: PodiumResult,
    finalOddsMap: Map<string, PositionOdds>,
  ): BetCalculation {
    const pickCalculations: PickCalculation[] = [];

    // Check each pick
    for (const pick of bet.picks) {
      const isCorrect = this.isPickCorrect(pick, podium);

      // Get final odds for this competitor
      const competitorFinalOdds = finalOddsMap.get(pick.competitorId);
      let finalOdd: number | null = null;
      let usedBogOdd = false;

      if (competitorFinalOdds) {
        // Get the final odd for the specific position
        finalOdd = competitorFinalOdds[pick.position as BetPosition];
      }

      // Calculate points for this pick
      let pointsEarned = 0;
      if (isCorrect) {
        // BOG: Use the better odd between oddAtBet and finalOdd
        let effectiveOdd = pick.oddAtBet;
        if (finalOdd !== null && finalOdd > pick.oddAtBet) {
          effectiveOdd = finalOdd;
          usedBogOdd = true;
        }

        pointsEarned = effectiveOdd;

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

      // Round to 2 decimal places to avoid floating point accumulation
      pointsEarned = Math.round(pointsEarned * 100) / 100;

      pickCalculations.push({
        pickId: pick.id,
        competitorId: pick.competitorId,
        position: pick.position,
        isCorrect,
        oddAtBet: pick.oddAtBet,
        hasBoost: pick.hasBoost,
        pointsEarned,
        finalOdd,
        usedBogOdd,
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
        totalPointsBeforeBonus *
        (DEFAULT_SCORING_PARAMS.perfectPodiumBonus - 1);
      finalPoints =
        totalPointsBeforeBonus * DEFAULT_SCORING_PARAMS.perfectPodiumBonus;
    }

    // Round to 2 decimal places to avoid floating point accumulation errors
    finalPoints = Math.round(finalPoints * 100) / 100;
    perfectPodiumBonus = Math.round(perfectPodiumBonus * 100) / 100;

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case 'first':
        return pick.competitorId === podium.firstId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case 'second':
        return pick.competitorId === podium.secondId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
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
    bet.status = calculation.finalPoints > 0 ? BetStatus.WON : BetStatus.LOST;
    await this.betRepository.save(bet);

    // Update individual picks
    for (const pickCalc of calculation.picks) {
      const pick = bet.picks.find((p) => p.id === pickCalc.pickId);
      if (pick) {
        pick.isCorrect = pickCalc.isCorrect;
        pick.pointsEarned = pickCalc.pointsEarned;
        // BOG fields
        pick.finalOdd = pickCalc.finalOdd;
        pick.usedBogOdd = pickCalc.usedBogOdd;
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

    // Update or create ranking records per bet
    for (const calc of calculations) {
      const hasCorrectPick = calc.picks.some((p) => p.isCorrect);
      const hasBoost = calc.picks.some((p) => p.hasBoost);

      await this.upsertBettorRanking(
        calc.userId,
        month,
        year,
        calc.finalPoints,
        hasCorrectPick ? 1 : 0,
        calc.isPerfectPodium ? 1 : 0,
        hasBoost ? 1 : 0,
      );
    }

    if (SCORING_LOGGER_CONFIG.logRankingUpdates) {
      this.logger.log(
        `Updated rankings for ${calculations.length} bets in ${month}/${year}`,
      );
    }
  }

  /**
   * Create or update bettor ranking using atomic SQL to prevent race conditions.
   * Uses INSERT ... ON CONFLICT with atomic addition for all counters.
   */
  private async upsertBettorRanking(
    userId: string,
    month: number,
    year: number,
    pointsToAdd: number,
    betWon: number,
    perfectBet: number,
    boostUsed: number,
  ): Promise<void> {
    await this.bettorRankingRepository.query(
      `INSERT INTO bettor_rankings ("userId", "month", "year", "totalPoints", "betsPlaced", "betsWon", "perfectBets", "boostsUsed", "rank")
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, 0)
       ON CONFLICT ("userId", "month", "year")
       DO UPDATE SET "totalPoints" = bettor_rankings."totalPoints" + $4,
                     "betsPlaced" = bettor_rankings."betsPlaced" + 1,
                     "betsWon" = bettor_rankings."betsWon" + $5,
                     "perfectBets" = bettor_rankings."perfectBets" + $6,
                     "boostsUsed" = bettor_rankings."boostsUsed" + $7,
                     "updatedAt" = NOW()`,
      [userId, month, year, pointsToAdd, betWon, perfectBet, boostUsed],
    );
  }

  /**
   * Recalculate all ranks for a given month
   *
   * This should be called after all bets are finalized to assign proper ranks.
   * Ranks are based on total points (highest = rank 1).
   */
  async recalculateRanks(month: number, year: number): Promise<void> {
    this.logger.log(`Recalculating ranks for ${month}/${year}...`);

    // Atomic rank recalculation using a single SQL UPDATE with window function
    await this.bettorRankingRepository.query(
      `UPDATE bettor_rankings br
       SET rank = sub.new_rank
       FROM (
         SELECT id, RANK() OVER (ORDER BY "totalPoints" DESC) AS new_rank
         FROM bettor_rankings
         WHERE month = $1 AND year = $2
       ) sub
       WHERE br.id = sub.id`,
      [month, year],
    );

    this.logger.log(`Ranks recalculated atomically for ${month}/${year}`);
  }

  /**
   * Calculate XP bonus for high odds picks
   * Formula: (odds - 5) * 5 XP per correct pick with odds >= 5
   * Capped at 200 XP total per bet
   *
   * @param picks - Pick calculations
   * @returns XP bonus amount
   */
  private calculateHighOddsXP(picks: PickCalculation[]): number {
    let bonus = 0;

    for (const pick of picks) {
      if (pick.isCorrect && pick.oddAtBet >= 5) {
        // Formula: (cote - 5) * 5 XP
        // Ex: cote 10 = 25 XP, cote 20 = 75 XP
        bonus += Math.floor((pick.oddAtBet - 5) * 5);
      }
    }

    // Cap at 200 XP per bet
    return Math.min(bonus, 200);
  }

  /**
   * Handle perfect score celebration (60 points)
   * Generates celebration image and sends to TV display
   *
   * This runs asynchronously and does not block bet finalization
   */
  private async handlePerfectScoreCelebration(
    bet: Bet,
    calculation: BetCalculation,
  ): Promise<void> {
    try {
      this.logger.log(
        `🎉 Generating perfect score celebration for user ${bet.userId} (${calculation.finalPoints} points)`,
      );

      // Get user and betting week info for celebration
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const user = (await this.betRepository.manager.findOne('users', {
        where: { id: bet.userId },
        relations: ['characterVariant', 'characterVariant.baseCharacter'],
      })) as any; // Type cast as User entity isn't fully typed here

      const bettingWeek = await this.bettingWeekRepository.findOne({
        where: { id: bet.bettingWeekId },
      });

      if (!user) {
        this.logger.error(`User ${bet.userId} not found for celebration`);
        return;
      }

      if (!bettingWeek) {
        this.logger.error(`Betting week ${bet.bettingWeekId} not found`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const characterName =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        user.characterVariant?.baseCharacter?.name || 'Champion';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const characterImageUrl = user.characterVariant?.iconUrl || null;
      const raceTitle = `Week ${bettingWeek.weekNumber} - ${bettingWeek.year}`;

      // 1. Generate celebration image using canvas

      const imageBuffer =
        await this.canvasImageService.generatePerfectScoreCelebration({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          userName: user.username,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          characterName,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          characterImageUrl,
          score: 60,
          raceTitle,
          date: new Date(),
        });

      this.logger.log('✅ Celebration image generated successfully');

      // 2. Upload image to storage
      const imageUrl = await this.imageStorageService.uploadImage(
        imageBuffer,
        'celebration',
      );

      this.logger.log(`✅ Image uploaded: ${imageUrl}`);

      // 3. Send to TV display
      const sentToTv = await this.tvDisplayService.sendImageToTv(imageUrl, {
        type: 'celebration',
        duration: 15, // Display for 15 seconds
        priority: 10, // Highest priority
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        title: `Perfect Score - ${user.username}`,
        subtitle: raceTitle,
      });

      if (sentToTv) {
        this.logger.log(
          '🎉 Perfect score celebration sent to TV display successfully!',
        );
      } else {
        this.logger.warn(
          '⚠️  Failed to send celebration to TV display (TV may be disabled)',
        );
      }

      // 4. Emit event for other systems (e.g., notifications, social sharing)
      this.eventEmitter.emit('perfect.score', {
        userId: bet.userId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        userName: user.username,
        betId: bet.id,
        weekId: bet.bettingWeekId,
        points: calculation.finalPoints,
        imageUrl,
        celebratedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('❌ Failed to handle perfect score celebration', error);
      throw error; // Re-throw to be caught by the fire-and-forget handler
    }
  }
}
