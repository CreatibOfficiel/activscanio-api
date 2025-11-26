import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ArchivedCompetitorRanking } from './archived-competitor-ranking.entity';

@Entity('season_archives')
@Index(['month', 'year'], { unique: true })
export class SeasonArchive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  month: number;

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

  @Column({ type: 'int' })
  totalBettors: number;

  @Column({ type: 'int' })
  totalRaces: number;

  @Column({ type: 'int' })
  totalBets: number;

  @OneToMany(
    () => ArchivedCompetitorRanking,
    (ranking) => ranking.seasonArchive,
  )
  competitorRankings: ArchivedCompetitorRanking[];

  @CreateDateColumn()
  createdAt: Date;
}
