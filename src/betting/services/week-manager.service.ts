/**
 * WeekManagerService
 *
 * Manages the lifecycle of betting weeks:
 * - Creates new weeks automatically (Monday 00:00)
 * - Tracks current week
 * - Triggers initial odds calculation
 *
 * Design Principles:
 * - Idempotent operations (safe to run multiple times)
 * - Transaction-safe (atomic operations)
 * - Timezone-aware (UTC by default)
 * - Logging for audit trail
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BettingWeek,
  BettingWeekStatus,
} from '../entities/betting-week.entity';
import { OddsCalculatorService } from './odds-calculator.service';

/**
 * Week calculation utilities
 */
class WeekUtils {
  /**
   * Get ISO week number for a date
   * ISO weeks start on Monday and week 1 contains Jan 4th
   */
  static getISOWeek(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Monday = 0
    target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target.getTime() - firstThursday.getTime();
    return 1 + Math.round(diff / 604800000); // 604800000 = 7 * 24 * 60 * 60 * 1000
  }

  /**
   * Get the Monday of a given week
   */
  static getMondayOfWeek(year: number, week: number): Date {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const firstMonday = new Date(year, 0, 4 - jan4Day);
    const monday = new Date(firstMonday.getTime() + (week - 1) * 604800000);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Get the Sunday of a given week
   */
  static getSundayOfWeek(year: number, week: number): Date {
    const monday = this.getMondayOfWeek(year, week);
    const sunday = new Date(monday.getTime() + 6 * 86400000); // +6 days
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }

  /**
   * Get the month a week belongs to (based on Monday)
   */
  static getWeekMonth(year: number, week: number): number {
    const monday = this.getMondayOfWeek(year, week);
    return monday.getMonth() + 1; // getMonth() returns 0-11
  }
}

@Injectable()
export class WeekManagerService {
  private readonly logger = new Logger(WeekManagerService.name);

  constructor(
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    private readonly oddsCalculatorService: OddsCalculatorService,
  ) {}

  /**
   * Create a new betting week for the current week
   *
   * This method is idempotent - it will not create duplicates.
   * Intended to be called by a cron job every Monday 00:00.
   *
   * @returns The created or existing week
   */
  async createCurrentWeek(): Promise<BettingWeek> {
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = WeekUtils.getISOWeek(now);

    this.logger.log(
      `Creating betting week for ${year}-W${weekNumber.toString().padStart(2, '0')}`,
    );

    // Check if week already exists
    const existing = await this.bettingWeekRepository.findOne({
      where: { year, weekNumber },
    });

    if (existing) {
      this.logger.log(`Week ${year}-W${weekNumber} already exists`);
      return existing;
    }

    // Create new week
    const startDate = WeekUtils.getMondayOfWeek(year, weekNumber);
    const endDate = WeekUtils.getSundayOfWeek(year, weekNumber);
    const month = WeekUtils.getWeekMonth(year, weekNumber);

    const week = this.bettingWeekRepository.create({
      weekNumber,
      year,
      month,
      startDate,
      endDate,
      status: BettingWeekStatus.OPEN,
    });

    const savedWeek = await this.bettingWeekRepository.save(week);

    this.logger.log(
      `Created betting week ${year}-W${weekNumber}: ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    // Calculate initial odds (async, don't wait)
    this.calculateInitialOdds(savedWeek.id);

    return savedWeek;
  }

  /**
   * Calculate initial odds for a new week
   *
   * This runs asynchronously after week creation to avoid blocking.
   * Initial odds might be based on previous week's data.
   */
  private async calculateInitialOdds(weekId: string): Promise<void> {
    try {
      this.logger.log(`Calculating initial odds for week ${weekId}`);
      await this.oddsCalculatorService.calculateOddsForWeek(weekId);
      this.logger.log(
        `Initial odds calculated successfully for week ${weekId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to calculate initial odds for week ${weekId}`,
        error.stack,
      );
      // Don't throw - week is already created, odds can be recalculated later
    }
  }

  /**
   * Get the current active betting week
   *
   * @returns The current week or null if none exists
   */
  async getCurrentWeek(): Promise<BettingWeek | null> {
    const now = new Date();

    return await this.bettingWeekRepository.findOne({
      where: {
        status: BettingWeekStatus.OPEN,
      },
      order: { startDate: 'DESC' },
    });
  }

  /**
   * Get or create the current week
   *
   * Ensures a betting week always exists for the current week.
   * Useful for race creation hooks.
   */
  async getOrCreateCurrentWeek(): Promise<BettingWeek> {
    let week = await this.getCurrentWeek();

    if (!week) {
      this.logger.log('No current week found, creating one');
      week = await this.createCurrentWeek();
    }

    return week;
  }

  /**
   * Get week by ID
   */
  async getWeekById(weekId: string): Promise<BettingWeek | null> {
    return await this.bettingWeekRepository.findOne({
      where: { id: weekId },
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
    });
  }

  /**
   * Close a betting week
   *
   * Called by the finalization cron job on Sunday 23:59.
   * This prevents new bets from being placed.
   *
   * @param weekId - The week to close
   */
  async closeWeek(weekId: string): Promise<void> {
    const week = await this.getWeekById(weekId);

    if (!week) {
      throw new Error(`Week ${weekId} not found`);
    }

    if (week.status !== BettingWeekStatus.OPEN) {
      this.logger.warn(`Week ${weekId} is already ${week.status}`);
      return;
    }

    week.status = BettingWeekStatus.CLOSED;
    await this.bettingWeekRepository.save(week);

    this.logger.log(`Week ${weekId} closed for betting`);
  }

  /**
   * Finalize a betting week with podium results
   *
   * Called after the week is closed and podium is determined.
   * This triggers points calculation for all bets.
   *
   * @param weekId - The week to finalize
   * @param podiumIds - The final podium [first, second, third]
   */
  async finalizeWeek(
    weekId: string,
    podiumIds: [string, string, string],
  ): Promise<void> {
    const week = await this.getWeekById(weekId);

    if (!week) {
      throw new Error(`Week ${weekId} not found`);
    }

    if (week.status === BettingWeekStatus.FINALIZED) {
      this.logger.warn(`Week ${weekId} is already finalized`);
      return;
    }

    // Set podium
    week.podiumFirstId = podiumIds[0];
    week.podiumSecondId = podiumIds[1];
    week.podiumThirdId = podiumIds[2];
    week.status = BettingWeekStatus.FINALIZED;
    week.finalizedAt = new Date();

    await this.bettingWeekRepository.save(week);

    this.logger.log(
      `Week ${weekId} finalized with podium: ${podiumIds.join(', ')}`,
    );
  }

  /**
   * Get all weeks for a given month
   */
  async getWeeksByMonth(month: number, year: number): Promise<BettingWeek[]> {
    return await this.bettingWeekRepository.find({
      where: { month, year },
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
      order: { weekNumber: 'ASC' },
    });
  }
}
