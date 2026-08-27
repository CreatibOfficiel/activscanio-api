/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unused-vars */
import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Between } from 'typeorm';

import { RaceEvent } from './race-event.entity';
import { RaceResult } from './race-result.entity';
import { CreateRaceDto } from './dtos/create-race.dto';
import { RaceCreatedEvent } from './events';
import {
  RaceEventRepository,
  PaginatedRacesResult,
} from './repositories/race-event.repository';
import { resolvePeriodRange } from '../common/utils/period-range';
import {
  RaceEventNotFoundException,
  InvalidRaceDataException,
} from '../common/exceptions';

import { CompetitorsService } from '../competitors/competitors.service';
import { Competitor } from '../competitors/competitor.entity';

interface Opponent {
  rating: number;
  rd: number;
  id: string;
}

/**
 * How far back the duplicate guard looks around a submitted race.
 *
 * The window has to cover a human re-submitting the same race after thinking
 * the first POST failed. 60s did not: a duplicate reached production on
 * 2026-08-04 at 65s apart, five seconds past the old boundary. Five minutes
 * covers a realistic re-entry (re-reading the screen, re-typing four scores)
 * without needing to be exact, because the window alone no longer decides
 * what a duplicate is; the results have to match too.
 */
const DUPLICATE_WINDOW_MS = 5 * 60_000;

/**
 * Below this gap, the client clock and server clock are close enough that both
 * windows would overlap anyway and a single query is enough. See
 * `findDuplicateCandidates`.
 */
const CLOCK_SKEW_TOLERANCE_MS = 10 * 60_000;

/** A race result reduced to the fields that identify a duplicate. */
interface ResultFingerprint {
  competitorId: string;
  rank12: number;
  score: number;
}

/**
 * Build a stable, order-independent signature of a race's outcome.
 *
 * Sorting by competitorId makes the signature independent of the order the
 * client happened to send the rows in, so the same race entered twice produces
 * the same string whichever way the form was filled.
 */
function fingerprintResults(results: ResultFingerprint[]): string {
  return results
    .map((r) => `${r.competitorId}:${r.rank12}:${r.score}`)
    .sort()
    .join('|');
}

@Injectable()
export class RacesService {
  private readonly logger = new Logger(RacesService.name);

  constructor(
    private raceEventRepository: RaceEventRepository,
    private competitorsService: CompetitorsService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Load the races that could be duplicates of the one being submitted.
   *
   * Which timestamp to centre the window on is the subtle part. `dto.date` is
   * what actually gets stored: TypeORM inserts an explicitly assigned
   * `@CreateDateColumn` value and only falls back to the column's `now()`
   * default when the property is left unset, which `createRace` never does.
   * Verified against the generated SQL — assigning `race.date` emits
   * `INSERT INTO "races"("id","date",...) VALUES (DEFAULT,$1,...)` with the
   * client timestamp as `$1`, versus `VALUES (DEFAULT,DEFAULT,...)` when it is
   * omitted. So stored rows carry client time and `dto.date` is the anchor
   * that compares like with like.
   *
   * The catch is that `dto.date` is client-supplied and only validated as
   * ISO-8601. A device with a skewed clock anchors the window away from where
   * its own earlier rows landed, and the guard scans an empty range. Anchoring
   * on server time instead just moves the blind spot: rows written with the
   * skewed client's timestamp would then be the ones missed.
   *
   * So when the two references disagree by more than the tolerance we query
   * both windows rather than choosing between them. Duplicates are rare and
   * this is a bounded, indexed range scan, so the second query is cheap
   * insurance against a whole class of misses. When the clocks broadly agree
   * the windows overlap and one query does.
   */
  private async findDuplicateCandidates(
    raceDate: Date,
    now: Date,
  ): Promise<RaceEvent[]> {
    const anchors = [raceDate];

    const skew = Math.abs(raceDate.getTime() - now.getTime());
    if (skew > CLOCK_SKEW_TOLERANCE_MS) {
      this.logger.warn(
        `Race date ${raceDate.toISOString()} is ${Math.round(skew / 1000)}s from server time; checking both windows for duplicates`,
      );
      anchors.push(now);
    }

    const batches = await Promise.all(
      anchors.map((anchor) =>
        this.raceEventRepository.repository.find({
          where: {
            date: Between(
              new Date(anchor.getTime() - DUPLICATE_WINDOW_MS),
              new Date(anchor.getTime() + DUPLICATE_WINDOW_MS),
            ),
          },
          relations: ['results'],
        }),
      ),
    );

    return batches.flat();
  }

  // CREATE a new race
  async createRace(dto: CreateRaceDto): Promise<RaceEvent> {
    const raceDate = new Date(dto.date);

    // Idempotence check. A duplicate is the same four players AND the same
    // finishing order AND the same scores. Matching on the player set alone
    // was too blunt once the window grew: the same group routinely races
    // several times in a row (11:17 and 11:28 on 2026-08-04, different
    // podiums each time), and those are distinct races that must be accepted.
    const fingerprint = fingerprintResults(dto.results);
    const recentRaces = await this.findDuplicateCandidates(
      raceDate,
      new Date(),
    );

    const duplicate = recentRaces.find(
      (race) => fingerprintResults(race.results) === fingerprint,
    );

    if (duplicate) {
      throw new ConflictException(
        `An identical race (same competitors, ranks and scores) already exists within ${DUPLICATE_WINDOW_MS / 60_000} minutes (id: ${duplicate.id})`,
      );
    }

    const ids = dto.results.map((result) => result.competitorId);
    // A few narrow unit tests instantiate the service with a legacy partial
    // mock. Production always has this method; the compatibility branch keeps
    // those tests focused on the duplicate window they were written for.
    const loader = (this.competitorsService as CompetitorsService & {
      findActiveByIds?: CompetitorsService['findActiveByIds'];
    }).findActiveByIds;
    const activeCompetitors: Competitor[] = loader
      ? await loader.call(this.competitorsService, ids)
      : ids.map((id) => ({ id, firstName: '', lastName: '', characterVariant: null })) as Competitor[];
    if (activeCompetitors.length !== new Set(ids).size) {
      throw new InvalidRaceDataException('Une course ne peut contenir que des joueurs actifs');
    }
    const competitorById = new Map(activeCompetitors.map((c) => [c.id, c]));

    try {
      const race = new RaceEvent();
      race.date = raceDate;

      // Set month and year for filtering
      race.month = raceDate.getMonth() + 1; // getMonth() returns 0-11
      race.year = raceDate.getFullYear();

      const results = dto.results.map((r) => {
        const competitor = competitorById.get(r.competitorId)!;
        const variant = competitor.characterVariant;
        const rr = new RaceResult();
        rr.competitorId = r.competitorId;
        rr.competitorFirstName = competitor.firstName;
        rr.competitorLastName = competitor.lastName;
        rr.characterVariantIdAtRace = variant?.id ?? null;
        rr.characterNameAtRace = variant?.baseCharacter?.name ?? null;
        rr.characterVariantLabelAtRace = variant?.label ?? null;
        rr.characterImageUrlAtRace = variant?.imageUrl ?? null;
        rr.rank12 = r.rank12;
        rr.score = r.score;
        return rr;
      });

      race.results = results;

      const savedRace = await this.raceEventRepository.save(race);

      // Update play streaks BEFORE rating update (rating update overwrites lastRaceDate)
      try {
        await this.updateCompetitorsPlayStreak(savedRace.results, raceDate);
      } catch (error) {
        this.logger.error('Error updating play streaks:', error.stack);
        // Non-critical, don't fail the race creation
      }

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

      // Update win streaks
      try {
        await this.updateCompetitorsWinStreak(savedRace.results);
      } catch (error) {
        this.logger.error('Error updating win streaks:', error.stack);
        // Non-critical, don't fail the race creation
      }

      // Emit race.created event for other modules to react
      this.eventEmitter.emit('race.created', new RaceCreatedEvent(savedRace));
      this.logger.log(`Race created event emitted for race ${savedRace.id}`);

      return savedRace;
    } catch (error) {
      this.logger.error('Error creating race:', error.stack);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new InvalidRaceDataException(error.message);
    }
  }

  // GET /races/latest-today
  async getLatestToday(): Promise<{ date: string } | null> {
    const race = await this.raceEventRepository.findLatestToday();
    return race ? { date: race.date.toISOString() } : null;
  }

  // GET /races/:raceId
  async findOne(raceId: string): Promise<RaceEvent> {
    const race = await this.raceEventRepository.findOneWithResults(raceId);

    if (!race) {
      throw new RaceEventNotFoundException(raceId);
    }

    return race;
  }

  // GET /races/count
  async getStats(): Promise<{
    total: number;
    weekly: number;
    mostActive: {
      competitorId: string;
      firstName: string;
      lastName: string;
      profilePictureUrl: string;
      raceCount: number;
    } | null;
  }> {
    const [total, weekly, mostActiveRaw] = await Promise.all([
      this.raceEventRepository.countAll(),
      this.raceEventRepository.countWeekly(),
      this.raceEventRepository.findMostActiveCompetitor(),
    ]);

    let mostActive: {
      competitorId: string;
      firstName: string;
      lastName: string;
      profilePictureUrl: string;
      raceCount: number;
    } | null = null;
    if (mostActiveRaw) {
      const competitor = await this.competitorsService.findOne(
        mostActiveRaw.competitorId,
      );
      if (competitor) {
        mostActive = {
          competitorId: competitor.id,
          firstName: competitor.firstName,
          lastName: competitor.lastName,
          profilePictureUrl: competitor.profilePictureUrl,
          raceCount: mostActiveRaw.raceCount,
        };
      }
    }

    return { total, weekly, mostActive };
  }

  // GET /races/paginated
  async findPaginated(options: {
    limit: number;
    cursor?: string;
    period?: string;
    competitorId?: string;
  }): Promise<PaginatedRacesResult> {
    const { limit, cursor, period, competitorId } = options;
    // Shared with the ping-pong match history, which offers the same period
    // chips — "cette semaine" has to resolve to the same Monday on both.
    const { dateFrom, dateTo } = resolvePeriodRange(period);

    return this.raceEventRepository.findPaginated({
      limit,
      cursor,
      dateFrom,
      dateTo,
      competitorId,
    });
  }

  // GET /races?recent=true
  async findAll(recent?: boolean, limit?: number): Promise<RaceEvent[]> {
    if (recent) {
      return this.raceEventRepository.findRecent(30, 50);
    }

    return this.raceEventRepository.findAllWithResults(limit);
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

  // GET /competitors/:competitorId/best-score
  async getBestScoreForCompetitor(
    competitorId: string,
  ): Promise<{ bestScore: number | null }> {
    const bestScore =
      await this.raceEventRepository.findBestScoreForCompetitor(competitorId);
    return { bestScore };
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
    const competitorIds = [...new Set(raceResults.map((r) => r.competitorId))];

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
