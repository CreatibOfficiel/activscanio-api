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
   * Find all races with results loaded
   */
  async findAllWithResults(): Promise<RaceEvent[]> {
    return this.repository.find({
      relations: ['results'],
      order: { date: 'DESC' },
    });
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
    const allRaces = await this.repository.find({
      relations: ['results'],
      order: { date: 'DESC' },
    });

    const competitorRaces = allRaces
      .filter((race) =>
        race.results.some((r) => r.competitorId === competitorId),
      )
      .slice(0, limit);

    return competitorRaces;
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
      .getRawOne();

    return result?.bestScore ?? null;
  }

  /**
   * Find the most recent race created today (UTC)
   */
  async countAll(): Promise<number> {
    return this.repository.count();
  }

  async countWeekly(): Promise<number> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return this.repository
      .createQueryBuilder('r')
      .where('r.date >= :weekAgo', { weekAgo })
      .getCount();
  }

  async findMostActiveCompetitor(): Promise<{ competitorId: string; raceCount: number } | null> {
    const result = await this.repository.manager
      .createQueryBuilder()
      .select('rr."competitorId"', 'competitorId')
      .addSelect('COUNT(*)', 'raceCount')
      .from('race_results', 'rr')
      .groupBy('rr."competitorId"')
      .orderBy('"raceCount"', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result) return null;
    return {
      competitorId: result.competitorId,
      raceCount: parseInt(result.raceCount, 10),
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
      qb.andWhere((subQb) => {
        const sub = subQb
          .subQuery()
          .select('rr."raceEventId"')
          .from('race_results', 'rr')
          .where('rr."competitorId" = :competitorId')
          .getQuery();
        return `r.id IN ${sub}`;
      }).setParameter('competitorId', competitorId);
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
      countQb.andWhere((subQb) => {
        const sub = subQb
          .subQuery()
          .select('rr."raceEventId"')
          .from('race_results', 'rr')
          .where('rr."competitorId" = :competitorId')
          .getQuery();
        return `r.id IN ${sub}`;
      }).setParameter('competitorId', competitorId);
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

    // Get all races
    const allRaces = await this.repository.find({
      relations: ['results'],
      order: { date: 'DESC' },
    });

    // Find races with same competitors
    const similarRaces = allRaces
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
