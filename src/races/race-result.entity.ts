import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { RaceEvent } from './race-event.entity';

@Entity('race_results')
export class RaceResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitorId: string;

  @Column()
  rank12: number;

  @Column()
  score: number;

  @ManyToOne(() => RaceEvent, (race) => race.results, {
    onDelete: 'CASCADE',
  })
  race: RaceEvent;
}
