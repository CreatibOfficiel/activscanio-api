import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorOdds } from '../entities/competitor-odds.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Competitor odds repository with domain-specific queries
 */
@Injectable()
export class CompetitorOddsRepository extends BaseRepository<CompetitorOdds> {
  constructor(
    @InjectRepository(CompetitorOdds)
    repository: Repository<CompetitorOdds>,
  ) {
    super(repository, 'CompetitorOdds');
  }

  /**
   * Find latest odds for all competitors in a betting week
   * Uses DISTINCT ON to get only the most recent odds for each competitor
   *
   * @param weekId - Betting week UUID
   */
  async findLatestForWeek(weekId: string): Promise<CompetitorOdds[]> {
    return this.repository
      .createQueryBuilder('odds')
      .where('odds.bettingWeekId = :weekId', { weekId })
      .distinctOn(['odds.competitorId'])
      .orderBy('odds.competitorId')
      .addOrderBy('odds.calculatedAt', 'DESC')
      .leftJoinAndSelect('odds.competitor', 'competitor')
      .getMany();
  }

  /**
   * Find all odds for a specific competitor
   * @param competitorId - Competitor UUID
   */
  async findByCompetitor(competitorId: string): Promise<CompetitorOdds[]> {
    return this.repository.find({
      where: { competitorId },
      relations: ['bettingWeek'],
      order: { calculatedAt: 'DESC' },
    });
  }

  /**
   * Find all odds for a specific betting week
   * @param bettingWeekId - Betting week UUID
   */
  async findByWeek(bettingWeekId: string): Promise<CompetitorOdds[]> {
    return this.repository.find({
      where: { bettingWeekId },
      relations: ['competitor'],
      order: { calculatedAt: 'DESC' },
    });
  }
}
