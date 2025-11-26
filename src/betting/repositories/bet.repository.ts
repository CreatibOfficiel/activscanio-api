import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bet } from '../entities/bet.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * Bet repository with domain-specific queries
 */
@Injectable()
export class BetRepository extends BaseRepository<Bet> {
  constructor(
    @InjectRepository(Bet)
    repository: Repository<Bet>,
  ) {
    super(repository, 'Bet');
  }

  /**
   * Find user's bet for a specific week
   * @param userId - User UUID
   * @param bettingWeekId - Betting week UUID
   */
  async findByUserAndWeek(
    userId: string,
    bettingWeekId: string,
  ): Promise<Bet | null> {
    return this.repository.findOne({
      where: { userId, bettingWeekId },
      relations: ['picks', 'picks.competitor'],
    });
  }

  /**
   * Find all bets for a user
   * @param userId - User UUID
   */
  async findByUser(userId: string): Promise<Bet[]> {
    return this.repository.find({
      where: { userId },
      relations: ['picks', 'picks.competitor', 'bettingWeek'],
      order: { placedAt: 'DESC' },
    });
  }

  /**
   * Find all bets for a betting week
   * @param bettingWeekId - Betting week UUID
   */
  async findByWeek(bettingWeekId: string): Promise<Bet[]> {
    return this.repository.find({
      where: { bettingWeekId },
      relations: ['picks', 'picks.competitor', 'user'],
    });
  }

  /**
   * Find finalized bets (for calculating rankings)
   */
  async findFinalized(): Promise<Bet[]> {
    return this.repository.find({
      where: { isFinalized: true },
      relations: ['picks', 'picks.competitor', 'user', 'bettingWeek'],
    });
  }
}
