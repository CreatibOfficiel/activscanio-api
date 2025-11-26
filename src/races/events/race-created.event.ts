import { RaceEvent } from '../race-event.entity';

/**
 * Event emitted when a new race is created
 * Used to trigger odds recalculation and other side effects
 */
export class RaceCreatedEvent {
  constructor(
    public readonly race: RaceEvent,
    public readonly bettingWeekId?: string,
  ) {}
}
