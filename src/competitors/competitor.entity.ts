import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
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

  @Column()
  elo: number;

  @Column()
  rank: number;

  @Column()
  raceCount: number;

  @Column('float')
  avgRank12: number;

  // Last race date (null if none)
  @Column({ type: 'timestamptz', nullable: true })
  lastRaceDate: Date | null;

  // Consecutive win streak (reset daily)
  @Column({ default: 0 })
  winStreak: number;

  // Days played in the current ISO week (Mon=1, Tue=2, ...). Reset when the week changes.
  @Column({ type: 'jsonb', default: [] })
  daysPlayedThisWeek: number[];

  // ISO week number
  @Column({ default: 0 })
  currentWeekNumber: number;

  // Year for the currentWeekNumber
  @Column({ default: 0 })
  currentWeekYear: number;

  // Used to detect a new "calendar day" => reset streak, etc.
  @Column({
    type: 'date',
    nullable: true,
    transformer: {
      from: (value: string | null) => (value ? new Date(value) : null),
      to: (value: Date | null) => value,
    }
  })
  lastRaceDay: Date | null;  
}
