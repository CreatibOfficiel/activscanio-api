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

  // Monthly streak (resets 1st of each month)
  @Column({ type: 'int', default: 0 })
  @Index()
  currentMonthlyStreak: number;

  @Column({ type: 'int', nullable: true })
  lastBetWeekNumber: number | null; // ISO week number (1-52)

  @Column({ type: 'int', nullable: true })
  lastBetYear: number | null;

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

  // Metadata
  @Column({ type: 'int', default: 0 })
  totalWeeksParticipated: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  lastUpdatedAt: Date;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
