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
  PENDING = 'pending', // New user, onboarding not completed
  BETTOR = 'bettor', // Bettor only (watches and bets, doesn't compete)
  PLAYER = 'player', // Player (competes, and can also bet)
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
    default: UserRole.PENDING,
  })
  role: UserRole;

  @Column({ nullable: true })
  competitorId: string;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedMonth: number | null;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedYear: number | null;

  // Gamification fields
  @Column({ type: 'int', default: 0 })
  @Index()
  xp: number;

  @Column({ type: 'int', default: 1 })
  @Index()
  level: number;

  @Column({ type: 'varchar', nullable: true })
  currentTitle: string | null;

  @Column({ type: 'int', default: 0 })
  achievementCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastAchievementUnlockedAt: Date | null;

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

  /**
   * Dynamic getter: checks if user has completed onboarding
   * based on actual data state (role + competitorId)
   *
   * - PENDING = onboarding not completed (new user)
   * - BETTOR = onboarding completed (bettor only, no competitorId)
   * - PLAYER = onboarding completed if competitorId is set
   */
  get hasCompletedOnboarding(): boolean {
    if (this.role === UserRole.PENDING) {
      return false;
    }
    if (this.role === UserRole.BETTOR) {
      return true;
    }
    if (this.role === UserRole.PLAYER && this.competitorId) {
      return true;
    }
    return false;
  }
}
