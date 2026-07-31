import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Competitor } from '../competitors/competitor.entity';

export enum UserRole {
  PENDING = 'pending', // New user, onboarding not completed
  BETTOR = 'bettor', // Legacy: watched without competing. Kept so existing
  // rows still load; new users never get it.
  PLAYER = 'player', // Player (competes)
}

/**
 * Which sport a user follows.
 *
 * Deliberately a separate column from `role`, which already carries three
 * overlapping meanings — onboarding stage, competitor status, and a legacy
 * betting distinction. Overloading it with a fourth would make every read of
 * it ambiguous.
 */
export enum SportPreference {
  MARIO_KART = 'mario-kart',
  PINGPONG = 'ping-pong',
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
    type: 'varchar',
    default: UserRole.PENDING,
  })
  role: UserRole;

  /**
   * Which leaderboards and entry forms this user sees.
   *
   * Defaults to BOTH rather than MARIO_KART: existing users predate the
   * choice, and showing them a sport they can ignore is a smaller wrong than
   * hiding one they already play.
   */
  @Column({
    type: 'varchar',
    default: SportPreference.BOTH,
  })
  sportPreference: SportPreference;

  @Column({ nullable: true })
  competitorId: string | null;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedMonth: number | null;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedYear: number | null;

  @Column({ type: 'int', nullable: true })
  lastBoostUsedSeason: number | null;

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
