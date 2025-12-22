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
   * Getter dynamique : vérifie si l'utilisateur a complété l'onboarding
   * basé sur l'état réel des données (rôle + competitorId)
   */
  get hasCompletedOnboarding(): boolean {
    // Spectateur : doit avoir le rôle SPECTATOR et pas de competitorId
    if (this.role === UserRole.SPECTATOR && !this.competitorId) {
      return true;
    }

    // Compétiteur (BOTH ou COMPETITOR) : doit avoir un competitorId
    if (
      (this.role === UserRole.BOTH || this.role === UserRole.COMPETITOR) &&
      this.competitorId
    ) {
      return true;
    }

    // Sinon, onboarding incomplet
    return false;
  }
}
