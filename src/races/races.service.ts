/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { CreateRaceDto } from './dtos/create-race.dto';
import { RaceCreatedEvent } from './events';
import { RaceEventRepository } from './repositories/race-event.repository';
import {
  RaceEventNotFoundException,
  InvalidRaceDataException,
} from '../common/exceptions';

import { CompetitorsService } from '../competitors/competitors.service';

interface Opponent {
  rating: number;
  rd: number;
  id: string;
}

@Injectable()
export class RacesService {
  private readonly logger = new Logger(RacesService.name);

  constructor(
    private raceEventRepository: RaceEventRepository,
    private competitorsService: CompetitorsService,
    private eventEmitter: EventEmitter2,
  ) {}

  // CREATE a new race
  async createRace(dto: CreateRaceDto): Promise<RaceEvent> {
    try {
      const raceDate = new Date(dto.date);

      const race = new RaceEvent();
      race.date = raceDate;

      // Set month and year for filtering
      race.month = raceDate.getMonth() + 1; // getMonth() returns 0-11
      race.year = raceDate.getFullYear();

      const results = dto.results.map((r) => {
        const rr = new RaceResult();
        rr.competitorId = r.competitorId;
        rr.rank12 = r.rank12;
        rr.score = r.score;
        return rr;
      });

      race.results = results;

      const savedRace = await this.raceEventRepository.save(race);

      // Update competitors' Glicko-2 ratings
      try {
        await this.updateCompetitorsRating(savedRace.results);
      } catch (error) {
        this.logger.error('Error updating competitor ratings:', error.stack);
        // We still return the race even if rating update fails
      }

      // Mark competitors as active this week
      await this.markCompetitorsActive(savedRace.results);

      // Update competitor recent positions
      try {
        await this.updateCompetitorsRecentPositions(savedRace.results);
      } catch (error) {
        this.logger.error('Error updating recent positions:', error.stack);
        // Non-critical, don't fail the race creation
      }

      // Update play streaks
      try {
        await this.updateCompetitorsPlayStreak(savedRace.results, raceDate);
      } catch (error) {
        this.logger.error('Error updating play streaks:', error.stack);
        // Non-critical, don't fail the race creation
      }

      // Update win streaks
      try {
        await this.updateCompetitorsWinStreak(savedRace.results);
      } catch (error) {
        this.logger.error('Error updating win streaks:', error.stack);
        // Non-critical, don't fail the race creation
      }

      // Emit race.created event for other modules to react
      this.eventEmitter.emit(
        'race.created',
        new RaceCreatedEvent(savedRace, savedRace.bettingWeekId),
      );
      this.logger.log(`Race created event emitted for race ${savedRace.id}`);

      return savedRace;
    } catch (error) {
      this.logger.error('Error creating race:', error.stack);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new InvalidRaceDataException(error.message);
    }
  }

  // GET /races/:raceId
  async findOne(raceId: string): Promise<RaceEvent> {
    const race = await this.raceEventRepository.findOneWithResults(raceId);

    if (!race) {
      throw new RaceEventNotFoundException(raceId);
    }

    return race;
  }

  // GET /races?recent=true
  async findAll(recent?: boolean): Promise<RaceEvent[]> {
    if (recent) {
      return this.raceEventRepository.findRecent(30, 50);
    }

    return this.raceEventRepository.findAllWithResults();
  }

  // GET /competitors/:competitorId/recent-races (via CompetitorsController)
  async getRecentRacesForCompetitor(
    competitorId: string,
    limit = 3,
  ): Promise<any[]> {
    // Use repository method to get races for competitor
    const races = await this.raceEventRepository.findForCompetitor(
      competitorId,
      limit,
    );

    // Extract info
    return races.map((race) => {
      const compResult = race.results.find(
        (r) => r.competitorId === competitorId,
      );
      return {
        raceId: race.id,
        date: race.date,
        rank12: compResult?.rank12,
        score: compResult?.score,
      };
    });
  }

  // GET /races/:raceId/similar
  async findSimilarRaces(raceId: string): Promise<RaceEvent[]> {
    return this.raceEventRepository.findSimilar(raceId, 3);
  }

  private async updateCompetitorsRating(
    raceResults: RaceResult[],
  ): Promise<void> {
    try {
      await this.competitorsService.updateRatingsForRace(raceResults);
    } catch (error) {
      this.logger.error('Error in updateCompetitorsRating:', error.stack);
      throw new InvalidRaceDataException(
        `Error updating competitor ratings: ${error.message}`,
      );
    }
  }

  /**
   * Mark competitors as active this week (for betting eligibility)
   */
  private async markCompetitorsActive(
    raceResults: RaceResult[],
  ): Promise<void> {
    try {
      const competitorIds = [
        ...new Set(raceResults.map((r) => r.competitorId)),
      ];

      for (const competitorId of competitorIds) {
        await this.competitorsService.markAsActiveThisWeek(competitorId);
      }

      this.logger.log(
        `Marked ${competitorIds.length} competitors as active this week`,
      );
    } catch (error) {
      this.logger.error('Error marking competitors as active:', error.message);
      // Don't throw - this is not critical
    }
  }

  /**
   * Update play streak for each competitor in the race
   */
  private async updateCompetitorsPlayStreak(
    raceResults: RaceResult[],
    raceDate: Date,
  ): Promise<void> {
    const competitorIds = [
      ...new Set(raceResults.map((r) => r.competitorId)),
    ];

    for (const competitorId of competitorIds) {
      await this.competitorsService.updatePlayStreak(competitorId, raceDate);
    }

    this.logger.log(
      `Updated play streaks for ${competitorIds.length} competitors`,
    );
  }

  /**
   * Update win streak for each competitor in the race
   */
  private async updateCompetitorsWinStreak(
    raceResults: RaceResult[],
  ): Promise<void> {
    for (const result of raceResults) {
      await this.competitorsService.updateWinStreak(
        result.competitorId,
        result.rank12,
      );
    }

    this.logger.log(
      `Updated win streaks for ${raceResults.length} competitors`,
    );
  }

  /**
   * Update competitor recent positions after a race
   */
  private async updateCompetitorsRecentPositions(
    raceResults: RaceResult[],
  ): Promise<void> {
    const data = raceResults.map((r) => ({
      competitorId: r.competitorId,
      rank12: r.rank12,
    }));

    await this.competitorsService.updateRecentPositions(data);
    this.logger.log(
      `Updated recent positions for ${data.length} competitors after race`,
    );
  }
}
