import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceEvent } from '../race-event.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

export interface PaginatedRacesResult {
  races: RaceEvent[];
  nextCursor: string | null;
  total: number;
}

/**
 * Default cap applied to the non-paginated race listing.
 * Kept high enough to cover every known consumer, low enough to keep the
 * payload bounded as the table grows.
 */
export const DEFAULT_RACES_LIMIT = 200;

/** Hard ceiling a caller-supplied limit is clamped to. */
export const MAX_RACES_LIMIT = 500;

/**
 * Number of most-recent races scanned when looking for a race with the same
 * competitor line-up. See findSimilar() for why this is bounded.
 */
export const SIMILAR_RACES_SCAN_WINDOW = 500;

/**
 * Race event repository with domain-specific queries
 */
@Injectable()
export class RaceEventRepository extends BaseRepository<RaceEvent> {
  constructor(
    @InjectRepository(RaceEvent)
    repository: Repository<RaceEvent>,
  ) {
    super(repository, 'RaceEvent');
  }

  /**
   * Find races with results loaded, newest first.
   *
   * Bounded on purpose: the unbounded version hydrated the whole table
   * (486 races / 1818 race_results) and serialised ~625 KB of JSON. Callers
   * that need the full history must use findPaginated().
   *
   * @param limit - Maximum number of races to return
   */
  async findAllWithResults(
    limit: number = DEFAULT_RACES_LIMIT,
  ): Promise<RaceEvent[]> {
    return this.repository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.results', 'res')
      .orderBy('r.date', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Find a single race with results loaded
   * @param id - Race event UUID
   */
  async findOneWithResults(id: string): Promise<RaceEvent | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['results'],
    });
  }

  /**
   * Find recent races (last N days)
   * @param daysAgo - Number of days to look back
   * @param limit - Maximum number of races to return
   */
  async findRecent(
    daysAgo: number = 7,
    limit: number = 20,
  ): Promise<RaceEvent[]> {
    const now = new Date();
    const minDate = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000);

    return this.repository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.results', 'res')
      .where('r.date >= :minDate', { minDate })
      .orderBy('r.date', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Find races where a specific competitor participated
   * @param competitorId - Competitor UUID
   * @param limit - Maximum number of races to return
   */
  async findForCompetitor(
    competitorId: string,
    limit: number = 3,
  ): Promise<RaceEvent[]> {
    // Filtering happens in SQL via EXISTS (same pattern as findPaginated),
    // which hits IDX_race_results_competitorId. The previous implementation
    // hydrated every race and every result to keep `limit` of them.
    return this.repository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.results', 'res')
      .where(
        'EXISTS (SELECT 1 FROM race_results rr WHERE rr."raceId" = r.id AND rr."competitorId" = :competitorId)',
        { competitorId },
      )
      .orderBy('r.date', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Find races with the same set of competitors as the reference race
   * Used for finding similar races for analysis
   *
   * @param raceId - Reference race UUID
   * @param limit - Maximum number of races to return
   */
  /**
   * Get the best (highest) score ever achieved by a competitor
   */
  async findBestScoreForCompetitor(
    competitorId: string,
  ): Promise<number | null> {
    const result = await this.repository.manager
      .createQueryBuilder()
      .select('MAX(rr.score)', 'bestScore')
      .from('race_results', 'rr')
      .where('rr."competitorId" = :competitorId', { competitorId })
      .getRawOne<{ bestScore: string | number | null }>();

    // MAX() comes back as a string through the driver, and as null when the
    // competitor has never raced. The declared return type is number | null,
    // so convert rather than pass the raw value through.
    if (result?.bestScore === null || result?.bestScore === undefined) {
      return null;
    }
    return Number(result.bestScore);
  }

  /**
   * Find the most recent race created today (UTC)
   */
  async countAll(): Promise<number> {
    return this.repository.count();
  }

  async countWeekly(): Promise<number> {
    // Monday 00:00 UTC of the current week
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? 6 : day - 1; // days since Monday
    const monday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - diff,
      ),
    );
    return this.repository
      .createQueryBuilder('r')
      .where('r.date >= :monday', { monday })
      .getCount();
  }

  async findMostActiveCompetitor(): Promise<{
    competitorId: string;
    raceCount: number;
  } | null> {
    const result = await this.repository.manager
      .createQueryBuilder()
      .select('rr."competitorId"', 'competitorId')
      .addSelect('COUNT(*)', 'raceCount')
      .from('race_results', 'rr')
      .groupBy('rr."competitorId"')
      .orderBy('"raceCount"', 'DESC')
      .limit(1)
      .getRawOne<{ competitorId: string; raceCount: string | number }>();

    if (!result) return null;
    return {
      competitorId: result.competitorId,
      // COUNT(*) is a bigint, which the driver hands back as a string.
      raceCount: Number(result.raceCount),
    };
  }

  async findPaginated(options: {
    limit: number;
    cursor?: string;
    dateFrom?: Date;
    dateTo?: Date;
    competitorId?: string;
  }): Promise<PaginatedRacesResult> {
    const { limit, cursor, dateFrom, dateTo, competitorId } = options;

    const qb = this.repository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.results', 'res')
      .orderBy('r.date', 'DESC')
      .addOrderBy('r.id', 'DESC');

    if (cursor) {
      // cursor format: "date|id"
      const [cursorDate, cursorId] = cursor.split('|');
      qb.andWhere(
        '(r.date < :cursorDate OR (r.date = :cursorDate AND r.id < :cursorId))',
        { cursorDate: new Date(cursorDate), cursorId },
      );
    }

    if (dateFrom) {
      qb.andWhere('r.date >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('r.date <= :dateTo', { dateTo });
    }

    if (competitorId) {
      // Use EXISTS rather than a subquery via the closure form: TypeORM's
      // closure subqueries do not reliably propagate parameters set on the
      // parent QB, which causes a runtime "bind 0 parameters" SQL error.
      // EXISTS is also a hash semi-join in Postgres, so performance is
      // equal or better than IN (SELECT ...).
      qb.andWhere(
        'EXISTS (SELECT 1 FROM race_results rr WHERE rr."raceId" = r.id AND rr."competitorId" = :competitorId)',
        { competitorId },
      );
    }

    // Fetch one extra to know if there's a next page
    const races = await qb.take(limit + 1).getMany();

    let nextCursor: string | null = null;
    if (races.length > limit) {
      races.pop();
      const last = races[races.length - 1];
      nextCursor = `${last.date.toISOString()}|${last.id}`;
    }

    // Count total matching races (without cursor/limit)
    const countQb = this.repository.createQueryBuilder('r');
    if (dateFrom) countQb.andWhere('r.date >= :dateFrom', { dateFrom });
    if (dateTo) countQb.andWhere('r.date <= :dateTo', { dateTo });
    if (competitorId) {
      countQb.andWhere(
        'EXISTS (SELECT 1 FROM race_results rr WHERE rr."raceId" = r.id AND rr."competitorId" = :competitorId)',
        { competitorId },
      );
    }
    const total = await countQb.getCount();

    return { races, nextCursor, total };
  }

  async findLatestToday(): Promise<RaceEvent | null> {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    return this.repository
      .createQueryBuilder('r')
      .where('r.date >= :startOfDay', { startOfDay })
      .orderBy('r.date', 'DESC')
      .getOne();
  }

  async findSimilar(raceId: string, limit: number = 3): Promise<RaceEvent[]> {
    // Get reference race
    const refRace = await this.repository.findOne({
      where: { id: raceId },
      relations: ['results'],
    });

    if (!refRace) {
      return [];
    }

    // Extract competitor IDs from reference race
    const refCompetitorIds = refRace.results.map((r) => r.competitorId).sort();

    // A race is "similar" when its competitor set is exactly equal to the
    // reference set. Expressing set equality in SQL means a GROUP BY +
    // HAVING with both a count check and a containment check, which is a lot
    // of machinery for a feature that only ever returns the 3 most recent
    // matches. Instead the scan window is bounded: only the last
    // SIMILAR_RACES_SCAN_WINDOW races are hydrated, and the set comparison
    // stays in JavaScript. Any real match is by definition recent (the same
    // line-up implies the same group of players), so the practical result is
    // unchanged while the worst case stops growing with the table.
    // Trade-off: a matching race older than the window is no longer found.
    const candidateRaces = await this.repository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.results', 'res')
      .orderBy('r.date', 'DESC')
      .take(SIMILAR_RACES_SCAN_WINDOW)
      .getMany();

    // Find races with same competitors
    const similarRaces = candidateRaces
      .filter((race) => {
        if (race.id === raceId) return false; // exclude reference race
        const raceCompetitorIds = race.results
          .map((r) => r.competitorId)
          .sort();
        return (
          JSON.stringify(raceCompetitorIds) === JSON.stringify(refCompetitorIds)
        );
      })
      .slice(0, limit);

    return similarRaces;
  }
}
