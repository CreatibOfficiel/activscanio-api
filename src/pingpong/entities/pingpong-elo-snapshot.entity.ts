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

/**
 * Daily rating snapshot, for the history chart.
 *
 * Mirrors `competitor_elo_snapshots` on the Mario Kart side, including the
 * unique (player, date) key that makes the snapshot cron idempotent.
 */
@Entity('pingpong_elo_snapshots')
@Index(['playerId', 'date'], { unique: true })
export class PingpongEloSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  playerId: string;

  @ManyToOne(() => PingpongPlayer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playerId' })
  player: PingpongPlayer;

  @Column({ type: 'date' })
  date: string;

  @Column('float')
  rating: number;

  @Column('float')
  rd: number;

  @Column('float')
  vol: number;

  @Column({ type: 'int', default: 0 })
  matchCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
