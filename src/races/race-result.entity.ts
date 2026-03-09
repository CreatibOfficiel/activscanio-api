import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
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

  @Column('float', { nullable: true })
  ratingDelta: number | null;

  @Column('float', { nullable: true })
  ratingBefore: number | null;

  @Column('float', { nullable: true })
  rdBefore: number | null;

  @Column('float', { nullable: true })
  volBefore: number | null;

  @Column('float', { nullable: true })
  ratingAfter: number | null;

  @Column('float', { nullable: true })
  rdAfter: number | null;

  @Column('float', { nullable: true })
  volAfter: number | null;

  @ManyToOne(() => RaceEvent, (race) => race.results, {
    onDelete: 'CASCADE',
  })
  race: RaceEvent;
}
