import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RaceCreatedEvent } from '../races/events/race-created.event';
import { DuelsService } from './duels.service';

@Injectable()
export class DuelsListener {
  private readonly logger = new Logger(DuelsListener.name);

  constructor(private readonly duelsService: DuelsService) {}

  @OnEvent('race.created')
  async handleRaceCreated(event: RaceCreatedEvent) {
    this.logger.log(`Race created event received for duel resolution: ${event.race.id}`);

    try {
      await this.duelsService.resolveDuelsForRace(event.race);
    } catch (error) {
      this.logger.error(
        `Failed to resolve duels for race ${event.race.id}:`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
