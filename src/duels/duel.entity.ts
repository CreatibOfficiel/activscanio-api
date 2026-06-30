import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum DuelStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  RESOLVED = 'resolved',
  AWAITING_SETTLEMENT = 'awaiting_settlement',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
  DECLINED = 'declined',
}

export enum StakeType {
  BEER = 'beer',
  PINT = 'pint',
  MARS = 'mars',
  MEAL = 'meal',
  CUSTOM = 'custom',
}

export enum DuelConditionType {
  RANK_WINS = 'rank_wins',
  MARGIN_GREATER = 'margin_greater',
  EXACT_TIE = 'exact_tie',
  MARGIN_BETWEEN = 'margin_between',
}

@Entity('duels')
@Index(['challengerUserId', 'challengedUserId', 'status'])
export class Duel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  challengerUserId: string;

  @Column()
  challengedUserId: string;

  @Column()
  challengerCompetitorId: string;

  @Column()
  challengedCompetitorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'challengerUserId' })
  challengerUser: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'challengedUserId' })
  challengedUser: User;

  // Legacy points stake — kept nullable for old duels, never written by new code.
  @Column({ type: 'int', nullable: true })
  stake: number | null;

  @Column({
    type: 'enum',
    enum: StakeType,
    default: StakeType.BEER,
  })
  stakeType: StakeType;

  // Only set when stakeType === CUSTOM.
  @Column({ type: 'varchar', nullable: true })
  stakeLabel: string | null;

  @Column({ type: 'varchar', nullable: true })
  stakeEmoji: string | null;

  @Column({
    type: 'enum',
    enum: DuelConditionType,
    nullable: true,
  })
  conditionType: DuelConditionType | null;

  @Column({ type: 'int', nullable: true })
  conditionValue: number | null;

  @Column({
    type: 'enum',
    enum: DuelStatus,
    default: DuelStatus.PENDING,
  })
  status: DuelStatus;

  @Column({ nullable: true })
  raceEventId: string;

  @Column({ nullable: true })
  winnerUserId: string;

  @Column({ nullable: true })
  loserUserId: string;

  // The betting week whose race resolves this duel.
  @Column({ type: 'uuid', nullable: true })
  targetBettingWeekId: string | null;

  // Proof of payment (settlement).
  @Column({ type: 'varchar', nullable: true })
  proofPhotoUrl: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  proofUploadedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  settledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  acceptedAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  resolvedAt: Date;

  // PENDING accept window expiry only.
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  // Deadline after acceptance: cancel if no qualifying race ran by then.
  @Column({ nullable: true, type: 'timestamptz' })
  resolveDeadline: Date | null;
}
