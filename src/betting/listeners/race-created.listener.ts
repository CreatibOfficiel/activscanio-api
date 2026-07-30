import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RaceCreatedEvent } from '../../races/events';

/**
 * Listener for race creation events.
 *
 * It used to recalculate odds for the betting week a race belonged to, but
 * `races.bettingWeekId` was never written by application code — only the dev
 * seeder set it — so the handler already returned immediately in production.
 * The field is gone from the event, and this listener disappears with the
 * betting module.
 */
@Injectable()
export class RaceCreatedListener {
  private readonly logger = new Logger(RaceCreatedListener.name);

  @OnEvent('race.created')
  handleRaceCreated(event: RaceCreatedEvent) {
    this.logger.log(
      `Race created event received: ${event.race.id} — no odds to recalculate`,
    );
  }
}
