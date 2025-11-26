import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Competitor } from '../../competitors/competitor.entity';
import { Bet } from './bet.entity';
import { CompetitorOdds } from './competitor-odds.entity';

export enum BettingWeekStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  FINALIZED = 'finalized',
}

@Entity('betting_weeks')
@Index(['year', 'weekNumber'], { unique: true })
export class BettingWeek {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  weekNumber: number;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  @Column({
    type: 'enum',
    enum: BettingWeekStatus,
    default: BettingWeekStatus.OPEN,
  })
  status: BettingWeekStatus;

  @Column({ nullable: true })
  podiumFirstId: string;

  @Column({ nullable: true })
  podiumSecondId: string;

  @Column({ nullable: true })
  podiumThirdId: string;

  @ManyToOne(() => Competitor, { nullable: true, eager: true })
  @JoinColumn({ name: 'podiumFirstId' })
  podiumFirst: Competitor;

  @ManyToOne(() => Competitor, { nullable: true, eager: true })
  @JoinColumn({ name: 'podiumSecondId' })
  podiumSecond: Competitor;

  @ManyToOne(() => Competitor, { nullable: true, eager: true })
  @JoinColumn({ name: 'podiumThirdId' })
  podiumThird: Competitor;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date;

  @OneToMany(() => Bet, (bet) => bet.bettingWeek)
  bets: Bet[];

  @OneToMany(() => CompetitorOdds, (odds) => odds.bettingWeek)
  odds: CompetitorOdds[];

  @CreateDateColumn()
  createdAt: Date;
}
