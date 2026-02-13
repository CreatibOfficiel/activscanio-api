import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorEloSnapshot } from '../entities/competitor-elo-snapshot.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

@Injectable()
export class CompetitorEloSnapshotRepository extends BaseRepository<CompetitorEloSnapshot> {
  constructor(
    @InjectRepository(CompetitorEloSnapshot)
    repository: Repository<CompetitorEloSnapshot>,
  ) {
    super(repository, 'CompetitorEloSnapshot');
  }

  /**
   * Find snapshots for a competitor, ordered by date ASC.
   * Optionally filter to snapshots on or after sinceDate.
   */
  async findByCompetitor(
    competitorId: string,
    sinceDate?: Date,
  ): Promise<CompetitorEloSnapshot[]> {
    const qb = this.repository
      .createQueryBuilder('snapshot')
      .where('snapshot.competitorId = :competitorId', { competitorId })
      .orderBy('snapshot.date', 'ASC');

    if (sinceDate) {
      qb.andWhere('snapshot.date >= :sinceDate', {
        sinceDate: sinceDate.toISOString().split('T')[0],
      });
    }

    return qb.getMany();
  }

  /**
   * Upsert a snapshot (INSERT ON CONFLICT DO UPDATE).
   * Idempotent: safe to call multiple times for the same (competitorId, date).
   */
  async upsertSnapshot(data: {
    competitorId: string;
    date: string;
    rating: number;
    rd: number;
    vol: number;
    raceCount: number;
  }): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(CompetitorEloSnapshot)
      .values(data)
      .orUpdate(['rating', 'rd', 'vol', 'raceCount'], ['competitorId', 'date'])
      .execute();
  }
}
