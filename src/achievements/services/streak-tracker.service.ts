import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStreak } from '../entities/user-streak.entity';
import { BettingWeek } from '../../betting/entities/betting-week.entity';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class StreakTrackerService {
  private readonly logger = new Logger(StreakTrackerService.name);

  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Update user streak when they place a bet
   *
   * @param userId - User ID
   * @param bettingWeekId - Betting week ID
   * @returns Updated UserStreak
   */
  async updateStreak(
    userId: string,
    bettingWeekId: string,
  ): Promise<UserStreak> {
    // Get or create user streak
    let userStreak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    if (!userStreak) {
      userStreak = this.userStreakRepository.create({
        userId,
        currentMonthlyStreak: 0,
        longestLifetimeStreak: 0,
        currentLifetimeStreak: 0,
        totalWeeksParticipated: 0,
      });
    }

    // Get betting week to determine the week number
    const bettingWeek = await this.bettingWeekRepository.findOne({
      where: { id: bettingWeekId },
    });

    if (!bettingWeek) {
      throw new Error(`Betting week ${bettingWeekId} not found`);
    }

    // Calculate ISO week number and year
    const weekDate = new Date(bettingWeek.startDate);
    const currentWeekNumber = getISOWeek(weekDate);
    const currentYear = getISOWeekYear(weekDate);

    // Check if this is a consecutive week
    const isConsecutive = this.isConsecutiveWeek(
      userStreak.lastBetWeekNumber,
      userStreak.lastBetYear,
      currentWeekNumber,
      currentYear,
    );

    if (isConsecutive) {
      // Continue streak
      userStreak.currentMonthlyStreak += 1;
      userStreak.currentLifetimeStreak += 1;

      this.logger.log(
        `User ${userId}: Streak continued (monthly: ${userStreak.currentMonthlyStreak}, lifetime: ${userStreak.currentLifetimeStreak})`,
      );
    } else {
      // Check if it's the same week (duplicate bet, shouldn't happen but handle it)
      if (
        userStreak.lastBetWeekNumber === currentWeekNumber &&
        userStreak.lastBetYear === currentYear
      ) {
        // Same week, don't update streak
        this.logger.debug(`User ${userId}: Bet in same week, streak unchanged`);
        return userStreak;
      }

      // Reset monthly streak (broken or first bet)
      if (userStreak.currentMonthlyStreak > 0) {
        this.logger.log(
          `User ${userId}: Monthly streak broken (was ${userStreak.currentMonthlyStreak})`,
        );
      }

      userStreak.currentMonthlyStreak = 1;
      userStreak.monthlyStreakStartedAt = new Date();

      // Reset lifetime streak
      if (userStreak.currentLifetimeStreak > 0) {
        this.logger.log(
          `User ${userId}: Lifetime streak broken (was ${userStreak.currentLifetimeStreak})`,
        );
      }

      userStreak.currentLifetimeStreak = 1;
      userStreak.lifetimeStreakStartedAt = new Date();
    }

    // Update longest lifetime streak if current is higher
    if (userStreak.currentLifetimeStreak > userStreak.longestLifetimeStreak) {
      const previousRecord = userStreak.longestLifetimeStreak;
      userStreak.longestLifetimeStreak = userStreak.currentLifetimeStreak;

      this.logger.log(
        `User ${userId}: New lifetime streak record! ${previousRecord} → ${userStreak.longestLifetimeStreak}`,
      );

      // Emit event for new record
      this.eventEmitter.emit('streak.new_record', {
        userId,
        newRecord: userStreak.longestLifetimeStreak,
        previousRecord,
      });
    }

    // Update last bet info
    userStreak.lastBetWeekNumber = currentWeekNumber;
    userStreak.lastBetYear = currentYear;
    userStreak.totalWeeksParticipated += 1;

    // Save and return
    const savedStreak = await this.userStreakRepository.save(userStreak);

    // Emit streak updated event
    this.eventEmitter.emit('streak.updated', {
      userId,
      monthlyStreak: savedStreak.currentMonthlyStreak,
      lifetimeStreak: savedStreak.currentLifetimeStreak,
      isNewRecord:
        savedStreak.currentLifetimeStreak === savedStreak.longestLifetimeStreak,
    });

    return savedStreak;
  }

  /**
   * Check if current week is consecutive to last bet week
   *
   * @param lastWeek - Last bet week number (1-52/53)
   * @param lastYear - Last bet year
   * @param currentWeek - Current week number
   * @param currentYear - Current year
   * @returns True if consecutive
   */
  private isConsecutiveWeek(
    lastWeek: number | null,
    lastYear: number | null,
    currentWeek: number,
    currentYear: number,
  ): boolean {
    // First bet ever
    if (lastWeek === null || lastYear === null) {
      return false;
    }

    // Same year, next week
    if (lastYear === currentYear && currentWeek === lastWeek + 1) {
      return true;
    }

    // Year transition: last week of year → first week of next year
    if (
      lastYear === currentYear - 1 &&
      lastWeek >= 52 && // Last week of previous year (52 or 53)
      currentWeek === 1 // First week of new year
    ) {
      return true;
    }

    return false;
  }

  /**
   * Update win streak when a bet is finalized
   *
   * @param userId - User ID
   * @param bettingWeekId - Betting week ID
   * @param isWin - Whether the user won (finalPoints > 0)
   */
  async updateWinStreak(
    userId: string,
    bettingWeekId: string,
    isWin: boolean,
  ): Promise<void> {
    let userStreak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    if (!userStreak) {
      userStreak = this.userStreakRepository.create({
        userId,
        currentMonthlyStreak: 0,
        longestLifetimeStreak: 0,
        currentLifetimeStreak: 0,
        totalWeeksParticipated: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
      });
    }

    // Get betting week to determine the week number
    const bettingWeek = await this.bettingWeekRepository.findOne({
      where: { id: bettingWeekId },
    });

    if (!bettingWeek) {
      throw new Error(`Betting week ${bettingWeekId} not found`);
    }

    const weekDate = new Date(bettingWeek.startDate);
    const currentWeekNumber = getISOWeek(weekDate);
    const currentYear = getISOWeekYear(weekDate);

    // Dedup: skip if already processed this week
    if (
      userStreak.lastWinWeekNumber === currentWeekNumber &&
      userStreak.lastWinYear === currentYear
    ) {
      this.logger.debug(
        `User ${userId}: Win streak already processed for week ${currentWeekNumber}/${currentYear}`,
      );
      return;
    }

    if (isWin) {
      const isConsecutive = this.isConsecutiveWeek(
        userStreak.lastWinWeekNumber,
        userStreak.lastWinYear,
        currentWeekNumber,
        currentYear,
      );

      if (isConsecutive) {
        userStreak.currentWinStreak += 1;
      } else {
        userStreak.currentWinStreak = 1;
      }

      userStreak.lastWinWeekNumber = currentWeekNumber;
      userStreak.lastWinYear = currentYear;

      // Check for new record
      if (userStreak.currentWinStreak > userStreak.bestWinStreak) {
        const previousRecord = userStreak.bestWinStreak;
        userStreak.bestWinStreak = userStreak.currentWinStreak;

        this.logger.log(
          `User ${userId}: New win streak record! ${previousRecord} → ${userStreak.bestWinStreak}`,
        );

        this.eventEmitter.emit('winStreak.new_record', {
          userId,
          newRecord: userStreak.bestWinStreak,
          previousRecord,
        });
      }

      this.logger.log(
        `User ${userId}: Win streak updated to ${userStreak.currentWinStreak} (best: ${userStreak.bestWinStreak})`,
      );
    } else {
      // Loss: reset current win streak
      if (userStreak.currentWinStreak > 0) {
        this.logger.log(
          `User ${userId}: Win streak broken (was ${userStreak.currentWinStreak})`,
        );
      }
      userStreak.currentWinStreak = 0;
      userStreak.lastWinWeekNumber = currentWeekNumber;
      userStreak.lastWinYear = currentYear;
    }

    await this.userStreakRepository.save(userStreak);

    this.eventEmitter.emit('winStreak.updated', {
      userId,
      currentWinStreak: userStreak.currentWinStreak,
      bestWinStreak: userStreak.bestWinStreak,
    });
  }

  /**
   * Get top win streaks for leaderboard
   */
  async getTopWinStreaks(limit: number = 10): Promise<UserStreak[]> {
    return await this.userStreakRepository.find({
      order: { bestWinStreak: 'DESC' },
      take: limit,
      relations: ['user'],
    });
  }

  /**
   * Reset monthly streaks for all users (called by cron on 1st of month)
   */
  async resetMonthlyStreaks(): Promise<number> {
    this.logger.log('Resetting monthly streaks for all users...');

    const result = await this.userStreakRepository.update(
      {},
      {
        currentMonthlyStreak: 0,
        monthlyStreakStartedAt: null,
        lastBetWeekNumber: null,
      },
    );

    this.logger.log(
      `Monthly streaks reset completed: ${result.affected || 0} users affected`,
    );

    return result.affected || 0;
  }

  /**
   * Get user streak
   */
  async getUserStreak(userId: string): Promise<UserStreak | null> {
    return await this.userStreakRepository.findOne({
      where: { userId },
    });
  }

  /**
   * Get top monthly streaks
   */
  async getTopMonthlyStreaks(limit: number = 10): Promise<UserStreak[]> {
    return await this.userStreakRepository.find({
      order: { currentMonthlyStreak: 'DESC' },
      take: limit,
      relations: ['user'],
    });
  }

  /**
   * Get top lifetime streaks
   */
  async getTopLifetimeStreaks(limit: number = 10): Promise<UserStreak[]> {
    return await this.userStreakRepository.find({
      order: { longestLifetimeStreak: 'DESC' },
      take: limit,
      relations: ['user'],
    });
  }
}
