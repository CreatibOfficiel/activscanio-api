import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Competitor } from '../competitors/competitor.entity';
import { Bet } from '../betting/entities/bet.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';

export enum UserRole {
  SPECTATOR = 'spectator',
  COMPETITOR = 'competitor',
  BOTH = 'both',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  clerkId: string;

  @Column()
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  profilePictureUrl: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.SPECTATOR,
  })
  role: UserRole;

  @Column({ nullable: true })
  competitorId: string;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedMonth: number | null;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedYear: number | null;

  @Column({ type: 'boolean', default: false })
  hasCompletedOnboarding: boolean;

  @OneToOne(() => Competitor, { nullable: true, eager: false })
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  @OneToMany(() => Bet, (bet) => bet.user)
  bets: Bet[];

  @OneToMany(() => BettorRanking, (ranking) => ranking.user)
  rankings: BettorRanking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
