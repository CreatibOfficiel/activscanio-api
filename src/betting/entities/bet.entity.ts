import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { BettingWeek } from './betting-week.entity';
import { BetPick } from './bet-pick.entity';

export enum BetStatus {
  PENDING = 'pending', // Waiting for results
  WON = 'won', // Won (at least 1 correct pick)
  LOST = 'lost', // Lost (no correct picks)
  CANCELLED = 'cancelled', // Cancelled
}

@Entity('bets')
@Index(['userId', 'bettingWeekId'], { unique: true })
export class Bet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  bettingWeekId: string;

  @ManyToOne(() => User, (user) => user.bets)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => BettingWeek, (week) => week.bets)
  @JoinColumn({ name: 'bettingWeekId' })
  bettingWeek: BettingWeek;

  @Column({ type: 'timestamptz' })
  placedAt: Date;

  @Column({ type: 'boolean', default: false })
  isFinalized: boolean;

  @Column({
    type: 'enum',
    enum: BetStatus,
    default: BetStatus.PENDING,
  })
  status: BetStatus;

  @Column({ type: 'float', nullable: true })
  pointsEarned: number;

  @OneToMany(() => BetPick, (pick) => pick.bet, { cascade: true, eager: true })
  picks: BetPick[];

  @Column({ type: 'timestamptz', nullable: true })
  resultSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
