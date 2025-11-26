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
import { BettingWeek } from './betting-week.entity';

@Entity('competitor_odds')
@Index(['competitorId', 'bettingWeekId', 'calculatedAt'])
export class CompetitorOdds {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitorId: string;

  @Column()
  bettingWeekId: string;

  @ManyToOne(() => Competitor)
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  @ManyToOne(() => BettingWeek, (week) => week.odds)
  @JoinColumn({ name: 'bettingWeekId' })
  bettingWeek: BettingWeek;

  @Column({ type: 'float' })
  odd: number;

  @Column({ type: 'timestamptz' })
  calculatedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    elo: number;
    rd: number;
    recentWins: number;
    winStreak: number;
    raceCount: number;
    avgRank: number;
    formFactor: number;
    probability: number;
  };

  @CreateDateColumn()
  createdAt: Date;
}
