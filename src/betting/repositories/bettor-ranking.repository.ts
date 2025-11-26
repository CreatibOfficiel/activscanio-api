import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BettorRanking } from '../entities/bettor-ranking.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Bettor ranking repository with domain-specific queries
 */
@Injectable()
export class BettorRankingRepository extends BaseRepository<BettorRanking> {
  constructor(
    @InjectRepository(BettorRanking)
    repository: Repository<BettorRanking>,
  ) {
    super(repository, 'BettorRanking');
  }

  /**
   * Find ranking for a specific user in a month
   * @param userId - User UUID
   * @param month - Month (1-12)
   * @param year - Year (e.g., 2025)
   */
  async findByUserAndMonth(
    userId: string,
    month: number,
    year: number,
  ): Promise<BettorRanking | null> {
    return this.repository.findOne({
      where: { userId, month, year },
      relations: ['user'],
    });
  }

  /**
   * Find all rankings for a specific month, ordered by total points
   * @param month - Month (1-12)
   * @param year - Year (e.g., 2025)
   */
  async findByMonth(month: number, year: number): Promise<BettorRanking[]> {
    return this.repository.find({
      where: { month, year },
      relations: ['user'],
      order: { totalPoints: 'DESC' },
    });
  }

  /**
   * Find all rankings for a specific user
   * @param userId - User UUID
   */
  async findByUser(userId: string): Promise<BettorRanking[]> {
    return this.repository.find({
      where: { userId },
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  /**
   * Update ranks for a specific month based on total points
   * @param month - Month (1-12)
   * @param year - Year (e.g., 2025)
   */
  async updateRanks(month: number, year: number): Promise<void> {
    const rankings = await this.findByMonth(month, year);

    // Rankings are already sorted by totalPoints DESC from findByMonth
    for (let i = 0; i < rankings.length; i++) {
      rankings[i].rank = i + 1;
      await this.repository.save(rankings[i]);
    }

    this.logger.log(`Updated ranks for ${year}-${month}: ${rankings.length} bettors`);
  }
}
