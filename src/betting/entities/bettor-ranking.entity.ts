import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('bettor_rankings')
@Index(['userId', 'month', 'year'], { unique: true })
export class BettorRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.rankings)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'float', default: 0 })
  totalPoints: number;

  @Column({ type: 'int', default: 0 })
  betsPlaced: number;

  @Column({ type: 'int', default: 0 })
  betsWon: number;

  @Column({ type: 'int', default: 0 })
  perfectBets: number;

  @Column({ type: 'int', default: 0 })
  boostsUsed: number;

  @Column({ type: 'int', nullable: true })
  rank: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
