import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PingpongPlayer } from './pingpong-player.entity';

export interface PingpongSetScore {
  a: number;
  b: number;
}

/**
 * A single best-of-three match.
 *
 * One row with playerA/playerB rather than a join table, because the arity is
 * fixed at two by definition. A join table (the shape `race_results` uses, and
 * rightly so — a race has 2 to 12 finishers) would cost a JOIN on every read,
 * and would make "the two players differ" inexpressible as a constraint.
 *
 * With one row, the database enforces both invariants itself.
 */
@Entity('pingpong_matches')
@Index(['pairKey', 'isoYear', 'isoWeek'])
@Index(['playerAId', 'playedAt'])
@Index(['playerBId', 'playedAt'])
@Index(['playedAt'])
export class PingpongMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  playerAId: string;

  @ManyToOne(() => PingpongPlayer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'playerAId' })
  playerA: PingpongPlayer;

  @Column()
  playerBId: string;

  @ManyToOne(() => PingpongPlayer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'playerBId' })
  playerB: PingpongPlayer;

  @Column()
  winnerId: string;

  /** Set scores from player A's point of view, in order. Two or three. */
  @Column({ type: 'jsonb' })
  sets: PingpongSetScore[];

  @Column({ type: 'int' })
  setsA: number;

  @Column({ type: 'int' })
  setsB: number;

  @Column({ type: 'timestamptz' })
  playedAt: Date;

  /* ---- Anti-farming bookkeeping ---- */

  /**
   * Canonical pair identifier, `min(id):max(id)`, so a pair reads the same
   * whichever side each player took. Without it, counting a pair's matches
   * for the week needs an unindexable bidirectional OR.
   */
  @Column()
  pairKey: string;

  @Column({ type: 'int' })
  isoYear: number;

  @Column({ type: 'int' })
  isoWeek: number;

  /** 0, 0.5 or 1 — what this match actually counted for. */
  @Column('float')
  appliedWeight: number;

  /** True when the rating gap exceeded the freeze threshold. */
  @Column({ default: false })
  ratingFrozen: boolean;

  /* ---- Audit trail, so any ranking can be reconstructed ---- */

  @Column('float')
  ratingABefore: number;

  @Column('float')
  ratingAAfter: number;

  @Column('float')
  rdABefore: number;

  @Column('float')
  rdAAfter: number;

  @Column('float')
  ratingBBefore: number;

  @Column('float')
  ratingBAfter: number;

  @Column('float')
  rdBBefore: number;

  @Column('float')
  rdBAfter: number;

  @CreateDateColumn()
  createdAt: Date;
}
