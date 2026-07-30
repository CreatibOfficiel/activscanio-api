import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('user_streaks')
export class UserStreak {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  userId: string;

  // Season streak (resets at each 4-week season transition)
  @Column({ type: 'int', default: 0 })
  @Index()
  currentMonthlyStreak: number;

  @Column({ name: 'lastBetWeekNumber', type: 'int', nullable: true })
  lastParticipationWeekNumber: number | null; // ISO week number (1-52)

  @Column({ name: 'lastBetYear', type: 'int', nullable: true })
  lastParticipationYear: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  monthlyStreakStartedAt: Date | null;

  // Lifetime streak (record)
  @Column({ type: 'int', default: 0 })
  @Index()
  longestLifetimeStreak: number;

  @Column({ type: 'int', default: 0 })
  currentLifetimeStreak: number;

  @Column({ type: 'timestamptz', nullable: true })
  lifetimeStreakStartedAt: Date | null;

  // Warning dedup
  @Column({ name: 'lastBettingWarningWeek', type: 'int', nullable: true })
  lastParticipationWarningWeek: number | null;

  @Column({ name: 'lastBettingWarningYear', type: 'int', nullable: true })
  lastParticipationWarningYear: number | null;

  // Win streaks
  @Column({ type: 'int', default: 0 })
  currentWinStreak: number;

  @Column({ type: 'int', default: 0 })
  @Index()
  bestWinStreak: number;

  @Column({ type: 'int', nullable: true })
  lastWinWeekNumber: number | null;

  @Column({ type: 'int', nullable: true })
  lastWinYear: number | null;

  // Betting streak loss tracking
  @Column({ name: 'bettingStreakLostValue', type: 'int', nullable: true })
  participationStreakLostValue: number | null;

  @Column({ name: 'bettingStreakLostAt', type: 'timestamptz', nullable: true })
  participationStreakLostAt: Date | null;

  @Column({ name: 'bettingStreakLossSeenAt', type: 'timestamptz', nullable: true })
  participationStreakLossSeenAt: Date | null;

  // Metadata
  @Column({ type: 'int', default: 0 })
  totalWeeksParticipated: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  lastUpdatedAt: Date;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
