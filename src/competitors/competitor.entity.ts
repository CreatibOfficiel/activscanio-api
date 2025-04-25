import { CharacterVariant } from '../character-variants/character-variant.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
} from 'typeorm';

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
   * TrueSkill 'mu' value.
   */
  @Column('float', { default: 25 })  // typical default for TS
  mu: number;

  /**
   * TrueSkill 'sigma' value.
   */
  @Column('float', { default: 8.333 }) // typical default for TS (25/3)
  sigma: number;

  /**
   * This rank is your global rank in the leaderboard.
   */
  @Column({ default: 0 })
  rank: number;

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

  @OneToOne(
    () => CharacterVariant,
    (variant) => variant.competitor,
    { nullable: true },
  )
  characterVariant: CharacterVariant | null;
}
