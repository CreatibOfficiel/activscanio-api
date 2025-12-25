import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum RewardType {
  TITLE = 'TITLE',
  BADGE = 'BADGE',
  AVATAR = 'AVATAR',
  XP_MULTIPLIER = 'XP_MULTIPLIER',
}

export interface RewardData {
  title?: string;
  badgeIcon?: string;
  avatarUrl?: string;
  multiplier?: number;
}

@Entity('level_rewards')
export class LevelReward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  level: number;

  @Column({
    type: 'varchar',
  })
  rewardType: RewardType;

  @Column({ type: 'jsonb' })
  rewardData: RewardData;

  @Column({ type: 'text' })
  description: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
