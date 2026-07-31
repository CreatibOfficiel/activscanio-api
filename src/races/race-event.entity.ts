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

  @OneToMany(() => RaceResult, (res) => res.race, { cascade: true })
  results: RaceResult[];
}
