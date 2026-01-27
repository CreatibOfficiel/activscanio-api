import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RaceCreatedEvent } from '../../races/events';
import { OddsCalculatorService } from '../services/odds-calculator.service';

/**
 * Listener for race creation events
 * Triggers odds recalculation when a new race is created
 */
@Injectable()
export class RaceCreatedListener {
  private readonly logger = new Logger(RaceCreatedListener.name);

  constructor(private readonly oddsCalculator: OddsCalculatorService) {}

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
      await this.oddsCalculator.calculateOddsForWeek(event.bettingWeekId);
      this.logger.log(`Odds recalculated for week ${event.bettingWeekId}`);
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
