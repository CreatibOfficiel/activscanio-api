import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceCreatedEvent } from '../../races/events';
import { OddsCalculatorService } from '../services/odds-calculator.service';
import { BettingWeek, BettingWeekStatus } from '../entities/betting-week.entity';

/**
 * Listener for race creation events
 * Triggers odds recalculation when a new race is created
 *
 * Dynamic odds: Odds are recalculated after each race to reflect
 * the current state of the competition. Existing bets keep the
 * odds locked at the time they were placed.
 */
@Injectable()
export class RaceCreatedListener {
  private readonly logger = new Logger(RaceCreatedListener.name);

  constructor(
    private readonly oddsCalculator: OddsCalculatorService,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
  ) {}

  @OnEvent('race.created')
  async handleRaceCreated(event: RaceCreatedEvent) {
    this.logger.log(`Race created event received: ${event.race.id}`);

    // Only recalculate odds if race is assigned to a betting week
    if (!event.bettingWeekId) {
      this.logger.log(
        'Race not assigned to betting week, skipping odds calculation',
      );
      return;
    }

    try {
      // Check if the week is still OPEN (bets can still be placed)
      const week = await this.bettingWeekRepository.findOne({
        where: { id: event.bettingWeekId },
      });

      if (!week) {
        this.logger.warn(`Betting week ${event.bettingWeekId} not found`);
        return;
      }

      // Only recalculate if week is OPEN (not CALIBRATION, CLOSED, or FINALIZED)
      if (week.status !== BettingWeekStatus.OPEN) {
        this.logger.log(
          `Week ${event.bettingWeekId} status is ${week.status}, skipping odds recalculation`,
        );
        return;
      }

      await this.oddsCalculator.calculateOddsForWeek(event.bettingWeekId);
      this.logger.log(
        `Dynamic odds recalculated for week ${event.bettingWeekId} after race ${event.race.id}`,
      );
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to recalculate odds for week ${event.bettingWeekId}:`,
        errorStack,
      );
      // Don't throw - this is a side effect and shouldn't fail race creation
    }
  }
}
