import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationCategories {
  betting: boolean;
  achievements: boolean;
  rankings: boolean;
  races: boolean;
  special: boolean;
}

@Entity('notification_preferences')
export class NotificationPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  userId: string;

  @Column({ type: 'boolean', default: false })
  enablePush: boolean;

  @Column({ type: 'boolean', default: true })
  enableInApp: boolean;

  @Column({
    type: 'jsonb',
    default: {
      betting: true,
      achievements: true,
      rankings: true,
      races: true,
      special: true,
    },
  })
  categories: NotificationCategories;

  @Column({ type: 'jsonb', nullable: true })
  pushSubscription: PushSubscription | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
