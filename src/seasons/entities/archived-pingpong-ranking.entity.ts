import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { SeasonArchive } from './season-archive.entity';

/**
 * A player's ping-pong standing at the moment a season closed.
 *
 * Deliberately a separate table from `archived_competitor_rankings` rather
 * than a `sport` column on it: the two ratings are on incomparable scales and
 * the per-sport stats have nothing in common (races and average finishing
 * position on one side, sets and head-to-head record on the other). Merging
 * them would mean a table half of whose columns are always null.
 */
@Entity('archived_pingpong_rankings')
@Index(['seasonArchiveId', 'playerId'], { unique: true })
export class ArchivedPingpongRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  seasonArchiveId: string;

  @Column()
  playerId: string;

  /** Denormalised so the archive still reads correctly if a player leaves. */
  @Column()
  playerName: string;

  /** Null for anyone not eligible for a rank when the season closed. */
  @Column({ type: 'int', nullable: true })
  rank: number | null;

  /** True when the rating was still calibrating, or the player was inactive. */
  @Column({ type: 'boolean', default: false })
  provisional: boolean;

  @Column({ type: 'float' })
  finalRating: number;

  @Column({ type: 'float' })
  finalRd: number;

  @Column({ type: 'float' })
  finalVol: number;

  /** Every match played, including the ones that carried no rating weight. */
  @Column({ type: 'int' })
  totalMatches: number;

  @Column({ type: 'int' })
  wins: number;

  @Column({ type: 'int' })
  losses: number;

  @Column({ type: 'int' })
  setsWon: number;

  @Column({ type: 'int' })
  setsLost: number;

  @Column({ type: 'int' })
  bestStreak: number;

  @ManyToOne(() => SeasonArchive, (season) => season.pingpongRankings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seasonArchiveId' })
  seasonArchive: SeasonArchive;

  @CreateDateColumn()
  createdAt: Date;
}
