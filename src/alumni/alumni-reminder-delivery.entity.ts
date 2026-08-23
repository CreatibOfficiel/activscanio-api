import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('alumni_reminder_deliveries')
@Unique(['userId', 'alumniId', 'anniversaryYear'])
@Index(['userId', 'deliveredOn'])
export class AlumniReminderDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  alumniId: string;

  @Column('int')
  anniversaryYear: number;

  @Column('date')
  deliveredOn: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
