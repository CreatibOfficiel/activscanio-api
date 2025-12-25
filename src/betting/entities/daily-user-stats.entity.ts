import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('daily_user_stats')
@Unique(['userId', 'date'])
export class DailyUserStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ type: 'date' })
  @Index()
  date: Date;

  @Column({ type: 'int', default: 0 })
  betsPlaced: number;

  @Column({ type: 'int', default: 0 })
  betsWon: number;

  @Column({ type: 'float', default: 0 })
  pointsEarned: number;

  @Column({ type: 'int', default: 0 })
  xpEarned: number;

  @Column({ type: 'int', default: 0 })
  achievementsUnlocked: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
