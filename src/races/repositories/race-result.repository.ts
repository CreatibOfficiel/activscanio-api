import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceResult } from '../race-result.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Race result repository
 * Note: Most race result queries are done through RaceEvent relations
 */
@Injectable()
export class RaceResultRepository extends BaseRepository<RaceResult> {
  constructor(
    @InjectRepository(RaceResult)
    repository: Repository<RaceResult>,
  ) {
    super(repository, 'RaceResult');
  }

  /**
   * Find results for a specific competitor
   * @param competitorId - Competitor UUID
   */
  async findByCompetitor(competitorId: string): Promise<RaceResult[]> {
    return this.repository.find({
      where: { competitorId },
      relations: ['race'],
      order: { race: { date: 'DESC' } },
    });
  }

  /**
   * Find results for a specific race
   * @param raceId - Race event UUID
   */
  async findByRace(raceId: string): Promise<RaceResult[]> {
    return this.repository
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.race', 'race')
      .where('race.id = :raceId', { raceId })
      .orderBy('result.rank12', 'ASC')
      .getMany();
  }
}
