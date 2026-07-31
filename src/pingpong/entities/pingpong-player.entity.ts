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
import { Competitor } from '../../competitors/competitor.entity';

/**
 * A competitor's ping-pong record.
 *
 * Deliberately a separate table rather than columns on `competitors`, or a
 * generic `competitor_sport_stats`. Two reasons:
 *
 * - `competitors` is not an identity container. Of its 30 columns only four
 *   are identity; the rest is Mario Kart (avgRank12, recentPositions,
 *   raceCount…). A generic table would only ever hold ping-pong, since Mario
 *   Kart will never migrate into it.
 * - Physically separate tables make mixing the two rating scales impossible
 *   by construction, rather than a convention someone has to remember.
 */
@Entity('pingpong_players')
@Index(['competitorId'], { unique: true })
export class PingpongPlayer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitorId: string;

  @OneToOne(() => Competitor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  /* ---- Glicko-2 state, on its own scale ---- */

  @Column('float', { default: 1500 })
  rating: number;

  @Column('float', { default: 350 })
  rd: number;

  @Column('float', { default: 0.06 })
  vol: number;

  /* ---- Two match counters, and the distinction matters ---- */

  /**
   * Every match played, including those the anti-farming rule weighted to
   * zero. Drives displayed stats.
   */
  @Column({ type: 'int', default: 0 })
  matchCount: number;

  /**
   * Sum of applied weights. This is the ONLY counter that lets a player leave
   * calibration — otherwise eight matches against the same opponent would be
   * enough to farm your way out of it.
   */
  @Column('float', { default: 0 })
  weightedMatchCount: number;

  /* ---- Record ---- */

  @Column({ type: 'int', default: 0 })
  wins: number;

  @Column({ type: 'int', default: 0 })
  losses: number;

  @Column({ type: 'int', default: 0 })
  setsWon: number;

  @Column({ type: 'int', default: 0 })
  setsLost: number;

  @Column({ type: 'int', default: 0 })
  currentStreak: number;

  @Column({ type: 'int', default: 0 })
  bestStreak: number;

  /* ---- Activity ---- */

  @Column({ type: 'timestamptz', nullable: true })
  lastMatchAt: Date | null;

  /**
   * When the weekly inactivity decay last ran for this player.
   *
   * This is the idempotency guard. Without it, two runs of the decay cron on
   * the same day apply the formula twice: the deviation balloons, the
   * conservative score collapses, and the whole leaderboard is destroyed
   * silently — no exception, no log, just wrong numbers.
   */
  @Column({ type: 'timestamptz', nullable: true })
  lastDecayAt: Date | null;

  /* ---- Ranking eligibility (anti-farming layer c) ---- */

  @Column({ default: false })
  isRankingEligible: boolean;

  @Column({ type: 'int', default: 0 })
  distinctOpponents21d: number;

  @Column('float', { default: 0 })
  diversityScore21d: number;

  /**
   * The rank held at the start of the day, for the movement indicator.
   *
   * Written by the daily rank-snapshot cron. Null for anyone unranked at
   * capture time, which is not the same as having been last. Same name as
   * the Mario Kart column so both leaderboards read one field.
   */
  @Column({ type: 'int', nullable: true })
  previousDayRank: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
