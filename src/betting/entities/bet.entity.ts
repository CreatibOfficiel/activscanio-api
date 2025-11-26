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

  @Column({ type: 'float', nullable: true })
  pointsEarned: number;

  @OneToMany(() => BetPick, (pick) => pick.bet, { cascade: true, eager: true })
  picks: BetPick[];

  @CreateDateColumn()
  createdAt: Date;
}
