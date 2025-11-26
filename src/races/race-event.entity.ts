import {
    Entity,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    OneToMany,
    Column,
    ManyToOne,
    JoinColumn,
  } from 'typeorm';
  import { RaceResult } from './race-result.entity';
  import { BettingWeek } from '../betting/entities/betting-week.entity';

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

    @Column({ nullable: true })
    bettingWeekId: string;

    @ManyToOne(() => BettingWeek, { nullable: true })
    @JoinColumn({ name: 'bettingWeekId' })
    bettingWeek: BettingWeek;

    @OneToMany(() => RaceResult, (res) => res.race, { cascade: true })
    results: RaceResult[];
  }
  