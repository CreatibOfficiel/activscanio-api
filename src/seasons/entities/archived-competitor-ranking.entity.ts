import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { SeasonArchive } from './season-archive.entity';

@Entity('archived_competitor_rankings')
@Index(['seasonArchiveId', 'competitorId'], { unique: true })
export class ArchivedCompetitorRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  seasonArchiveId: string;

  @Column()
  competitorId: string;

  @Column()
  competitorName: string; // Denormalized for historical preservation

  @Column({ type: 'int' })
  rank: number;

  @Column({ type: 'float' })
  finalRating: number;

  @Column({ type: 'float' })
  finalRd: number;

  @Column({ type: 'float' })
  finalVol: number;

  @Column({ type: 'int' })
  totalRaces: number;

  @Column({ type: 'int' })
  winStreak: number;

  @Column({ type: 'float' })
  avgRank12: number;

  @ManyToOne(() => SeasonArchive, (season) => season.competitorRankings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seasonArchiveId' })
  seasonArchive: SeasonArchive;

  @CreateDateColumn()
  createdAt: Date;
}
