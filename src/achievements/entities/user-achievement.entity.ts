import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Achievement } from './achievement.entity';

@Entity('user_achievements')
@Unique(['userId', 'achievementId'])
export class UserAchievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  achievementId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  unlockedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  progress: any; // Progress tracking before unlock (optional)

  @Column({ type: 'boolean', default: false })
  notificationSent: boolean;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Achievement, (achievement) => achievement.userAchievements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'achievementId' })
  achievement: Achievement;
}
