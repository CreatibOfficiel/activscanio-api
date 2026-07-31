import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ArchivedCompetitorRanking } from './archived-competitor-ranking.entity';
import { ArchivedPingpongRanking } from './archived-pingpong-ranking.entity';

@Entity('season_archives')
@Index(['seasonNumber', 'year'], { unique: true })
export class SeasonArchive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'int' })
  seasonNumber: number;

  @Column({ type: 'int' })
  year: number;

  @Column({ nullable: true })
  seasonName: string;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  archivedAt: Date;

  @Column({ type: 'int' })
  totalCompetitors: number;

  /**
   * Left over from the betting feature, which is gone. Kept as a column so
   * archives written before its removal still load; always written as 0 now.
   */
  @Column({ type: 'int' })
  totalBettors: number;

  @Column({ type: 'int' })
  totalRaces: number;

  /** Same as totalBettors: a betting leftover, always 0 for new archives. */
  @Column({ type: 'int' })
  totalBets: number;

  /** Ping-pong players who played at least one match during the season. */
  @Column({ type: 'int', default: 0 })
  totalPingpongPlayers: number;

  /** Ping-pong matches recorded within the season's date range. */
  @Column({ type: 'int', default: 0 })
  totalPingpongMatches: number;

  @OneToMany(
    () => ArchivedCompetitorRanking,
    (ranking) => ranking.seasonArchive,
  )
  competitorRankings: ArchivedCompetitorRanking[];

  @OneToMany(() => ArchivedPingpongRanking, (ranking) => ranking.seasonArchive)
  pingpongRankings: ArchivedPingpongRanking[];

  @CreateDateColumn()
  createdAt: Date;
}
