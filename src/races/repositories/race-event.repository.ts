import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceEvent } from '../race-event.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

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
