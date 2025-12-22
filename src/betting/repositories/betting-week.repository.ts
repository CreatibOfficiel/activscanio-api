import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BettingWeek,
  BettingWeekStatus,
} from '../entities/betting-week.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Betting week repository with domain-specific queries
 */
@Injectable()
export class BettingWeekRepository extends BaseRepository<BettingWeek> {
  constructor(
    @InjectRepository(BettingWeek)
    repository: Repository<BettingWeek>,
  ) {
    super(repository, 'BettingWeek');
  }

  /**
   * Find the current open betting week
   */
  async findCurrentWeek(): Promise<BettingWeek | null> {
    return this.repository.findOne({
      where: { status: BettingWeekStatus.OPEN },
      order: { startDate: 'DESC' },
    });
  }

  /**
   * Find betting week by year and week number
   * @param year - Year (e.g., 2025)
   * @param weekNumber - Week number (1-52)
   */
  async findByYearAndWeek(
    year: number,
    weekNumber: number,
  ): Promise<BettingWeek | null> {
    return this.repository.findOne({
      where: { year, weekNumber },
    });
  }

  /**
   * Find all betting weeks with podium competitors loaded
   */
  async findAllWithPodium(): Promise<BettingWeek[]> {
    return this.repository.find({
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
      order: { startDate: 'DESC' },
    });
  }

  /**
   * Find betting week with all related races
   * @param id - Betting week UUID
   */
  async findOneWithRaces(id: string): Promise<BettingWeek | null> {
    return this.repository
      .createQueryBuilder('week')
      .leftJoinAndSelect('week.races', 'races')
      .leftJoinAndSelect('races.results', 'results')
      .where('week.id = :id', { id })
      .getOne();
  }
}
