import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Competitor } from '../competitor.entity';

@Entity('competitor_elo_snapshots')
@Index(['competitorId', 'date'], { unique: true })
export class CompetitorEloSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitorId: string;

  @ManyToOne(() => Competitor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  @Column({ type: 'date' })
  date: string;

  @Column('float')
  rating: number;

  @Column('float')
  rd: number;

  @Column('float')
  vol: number;

  @Column({ type: 'int', default: 0 })
  raceCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
