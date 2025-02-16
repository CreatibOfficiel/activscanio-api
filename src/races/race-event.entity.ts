import {
    Entity,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    OneToMany,
  } from 'typeorm';
  import { RaceResult } from './race-result.entity';
  
  @Entity('races')
  export class RaceEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @CreateDateColumn()
    date: Date;
  
    @OneToMany(() => RaceResult, (res) => res.race, { cascade: true })
    results: RaceResult[];
  }
  