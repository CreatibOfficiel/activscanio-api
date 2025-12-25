import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { XPSource } from '../enums/xp-source.enum';

@Entity('xp_history')
export class XPHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ type: 'int' })
  xpAmount: number;

  @Column({ type: 'varchar' })
  source: XPSource;

  @Column({ type: 'varchar', nullable: true })
  relatedEntityId: string | null; // betId, achievementId, etc.

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  earnedAt: Date;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
