import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Competitor } from '../../competitors/competitor.entity';

@Entity('competitor_monthly_stats')
@Index(['competitorId', 'month', 'year'], { unique: true })
export class CompetitorMonthlyStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitorId: string;

  @ManyToOne(() => Competitor)
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'float' })
  finalRating: number;

  @Column({ type: 'float' })
  finalRd: number;

  @Column({ type: 'float' })
  finalVol: number;

  @Column({ type: 'int' })
  raceCount: number;

  @Column({ type: 'int' })
  winStreak: number;

  @Column({ type: 'float' })
  avgRank12: number;

  @CreateDateColumn()
  createdAt: Date;
}
