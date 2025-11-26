import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetPick } from '../entities/bet-pick.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Bet pick repository
 * Note: Most bet pick queries are done through Bet relations
 */
@Injectable()
export class BetPickRepository extends BaseRepository<BetPick> {
  constructor(
    @InjectRepository(BetPick)
    repository: Repository<BetPick>,
  ) {
    super(repository, 'BetPick');
  }

  /**
   * Find all picks for a specific bet
   * @param betId - Bet UUID
   */
  async findByBet(betId: string): Promise<BetPick[]> {
    return this.repository.find({
      where: { betId },
      relations: ['competitor'],
    });
  }

  /**
   * Find all picks for a specific competitor
   * @param competitorId - Competitor UUID
   */
  async findByCompetitor(competitorId: string): Promise<BetPick[]> {
    return this.repository.find({
      where: { competitorId },
      relations: ['bet', 'bet.user'],
    });
  }
}
