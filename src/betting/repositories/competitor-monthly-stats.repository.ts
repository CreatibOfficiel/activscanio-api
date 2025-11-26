import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorMonthlyStats } from '../entities/competitor-monthly-stats.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Competitor monthly stats repository with domain-specific queries
 */
@Injectable()
export class CompetitorMonthlyStatsRepository extends BaseRepository<CompetitorMonthlyStats> {
  constructor(
    @InjectRepository(CompetitorMonthlyStats)
    repository: Repository<CompetitorMonthlyStats>,
  ) {
    super(repository, 'CompetitorMonthlyStats');
  }

  /**
   * Find stats for a specific competitor in a month
   * @param competitorId - Competitor UUID
   * @param month - Month (1-12)
   * @param year - Year (e.g., 2025)
   */
  async findByCompetitorAndMonth(
    competitorId: string,
    month: number,
    year: number,
  ): Promise<CompetitorMonthlyStats | null> {
    return this.repository.findOne({
      where: { competitorId, month, year },
      relations: ['competitor'],
    });
  }

  /**
   * Find all stats for a specific month
   * @param month - Month (1-12)
   * @param year - Year (e.g., 2025)
   */
  async findByMonth(month: number, year: number): Promise<CompetitorMonthlyStats[]> {
    return this.repository.find({
      where: { month, year },
      relations: ['competitor'],
      order: { finalRating: 'DESC' },
    });
  }

  /**
   * Find all stats for a specific competitor
   * @param competitorId - Competitor UUID
   */
  async findByCompetitor(competitorId: string): Promise<CompetitorMonthlyStats[]> {
    return this.repository.find({
      where: { competitorId },
      order: { year: 'DESC', month: 'DESC' },
    });
  }
}
