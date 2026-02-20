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
  CANCELLED = 'cancelled',
  DECLINED = 'declined',
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

  @Column({ type: 'int' })
  stake: number;

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

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  acceptedAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  resolvedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
