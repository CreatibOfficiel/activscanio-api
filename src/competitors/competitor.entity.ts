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

  // Last race date (null if none)
  @Column({ type: 'timestamptz', nullable: true })
  lastRaceDate: Date | null;

  // Consecutive win streak
  @Column({ default: 0 })
  winStreak: number;

  // Current month race count (reset monthly)
  @Column({ default: 0 })
  currentMonthRaceCount: number;

  // Active this week flag (reset every Monday)
  @Column({ default: false })
  isActiveThisWeek: boolean;

  @OneToOne(() => CharacterVariant, (variant) => variant.competitor, {
    nullable: true,
  })
  characterVariant: CharacterVariant | null;
}
