import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RaceCreatedEvent } from '../../races/events/race-created.event';
import { LiveBettingService } from '../services/live-betting.service';

@Injectable()
export class LiveRaceCreatedListener {
  private readonly logger = new Logger(LiveRaceCreatedListener.name);

  constructor(private readonly liveBettingService: LiveBettingService) {}

  @OnEvent('race.created')
  async handleRaceCreated(event: RaceCreatedEvent) {
    this.logger.log(
      `Race created event received for live bet resolution: ${event.race.id}`,
    );

    try {
      await this.liveBettingService.resolveForRace(event.race);
    } catch (error) {
      this.logger.error(
        `Failed to resolve live bets for race ${event.race.id}:`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
