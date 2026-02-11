import { CharacterVariant } from '../character-variants/character-variant.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';

@Entity('competitors')
export class Competitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  profilePictureUrl: string;

  /**
   * Glicko-2 rating value.
   * Default: 1500 (typical starting rating)
   */
  @Column('float', { default: 1500 })
  rating: number;

  /**
   * Glicko-2 rating deviation (RD).
   * Default: 350 (typical starting RD)
   */
  @Column('float', { default: 350 })
  rd: number;

  /**
   * Glicko-2 volatility.
   * Default: 0.06 (typical starting volatility)
   */
  @Column('float', { default: 0.06 })
  vol: number;

  @Column({ default: 0 })
  raceCount: number;

  @Column('float', { default: 0 })
  avgRank12: number;

  /**
   * Lifetime average rank across all races (never resets).
   * Used as baseline for relative form calculation.
   */
  @Column('float', { default: 0 })
  lifetimeAvgRank: number;

  // Last race date (null if none)
  @Column({ type: 'timestamptz', nullable: true })
  lastRaceDate: Date | null;

  // Consecutive win streak
  @Column({ default: 0 })
  winStreak: number;

  /**
   * Recent race positions (last 5 races).
   * Used for form display and calculation.
   * Format: [most_recent, ..., oldest]
   * Example: [1, 4, 2, 3, 1] means last race was 1st place
   */
  @Column('simple-array', { nullable: true })
  recentPositions: number[] | null;

  // Current month race count (reset monthly)
  @Column({ default: 0 })
  currentMonthRaceCount: number;

  // Active this week flag (reset every Monday)
  @Column({ default: false })
  isActiveThisWeek: boolean;

  /**
   * Total lifetime races count (never resets).
   * Used for calibration eligibility: need 5 races minimum to be pariable.
   */
  @Column({ type: 'int', default: 0 })
  totalLifetimeRaces: number;

  /**
   * Previous day rank for trend calculation.
   * Snapshot taken Mon-Fri at midnight.
   * Used to show if competitor is rising/falling in rankings.
   */
  @Column({ type: 'int', nullable: true })
  previousDayRank: number | null;

  @Column({ type: 'int', default: 0 })
  playStreak: number;

  @Column({ type: 'int', default: 0 })
  bestPlayStreak: number;

  @Column({ type: 'date', nullable: true })
  lastPlayStreakWarningDate: string | null;

  @OneToOne(() => CharacterVariant, (variant) => variant.competitor, {
    nullable: true,
  })
  characterVariant: CharacterVariant | null;
}
