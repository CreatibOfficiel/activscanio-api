import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { RaceEvent } from '../../races/race-event.entity';

export enum LiveBetStatus {
  DETECTING = 'detecting',
  ACTIVE = 'active',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled',
}

export interface DetectedCharacter {
  characterName: string;
  competitorId: string | null;
  confidence: number;
}

@Entity('live_bets')
@Index(['userId', 'status'])
@Index(['status', 'expiresAt'])
export class LiveBet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  competitorId: string;

  @ManyToOne(() => Competitor)
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  @Column({ type: 'float' })
  oddAtBet: number;

  @Column()
  photoUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  detectedCharacters: DetectedCharacter[] | null;

  @Column({ type: 'jsonb', nullable: true })
  confirmedCompetitorIds: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  detectionExpiresAt: Date | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ nullable: true })
  raceEventId: string | null;

  @ManyToOne(() => RaceEvent, { nullable: true })
  @JoinColumn({ name: 'raceEventId' })
  raceEvent: RaceEvent;

  @Column({
    type: 'enum',
    enum: LiveBetStatus,
    default: LiveBetStatus.DETECTING,
  })
  status: LiveBetStatus;

  @Column({ type: 'float', nullable: true })
  pointsEarned: number | null;

  @Column({ nullable: true })
  cancellationReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
