import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  Column,
} from 'typeorm';
import { RaceResult } from './race-result.entity';

@Entity('races')
export class RaceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  date: Date;

  @Column({ type: 'int', nullable: true })
  month: number;

  @Column({ type: 'int', nullable: true })
  year: number;

  /**
   * Legacy column from the betting system. Never written by application code
   * (only the dev seeder set it), so it is NULL in production. Kept until the
   * removal migration drops it.
   */
  @Column({ nullable: true })
  bettingWeekId: string;

  @OneToMany(() => RaceResult, (res) => res.race, { cascade: true })
  results: RaceResult[];
}
