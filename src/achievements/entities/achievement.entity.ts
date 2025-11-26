import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { UserAchievement } from './user-achievement.entity';

export enum AchievementCategory {
  PRECISION = 'PRECISION',
  REGULARITY = 'REGULARITY',
  AUDACITY = 'AUDACITY',
  RANKING = 'RANKING',
}

export enum AchievementRarity {
  COMMON = 'COMMON',
  RARE = 'RARE',
  EPIC = 'EPIC',
  LEGENDARY = 'LEGENDARY',
}

export enum AchievementConditionType {
  COUNT = 'COUNT',
  STREAK = 'STREAK',
  RANKING = 'RANKING',
  STAT_THRESHOLD = 'STAT_THRESHOLD',
}

export enum AchievementConditionOperator {
  GTE = 'gte', // Greater than or equal
  LTE = 'lte', // Less than or equal
  EQ = 'eq',   // Equal
}

export enum AchievementScope {
  LIFETIME = 'LIFETIME',
  MONTHLY = 'MONTHLY',
}

export interface AchievementCondition {
  type: AchievementConditionType;
  metric: string; // e.g., 'betsPlaced', 'perfectBets', 'rank', 'winRate'
  operator: AchievementConditionOperator;
  value: number;
  scope?: AchievementScope;
}

@Entity('achievements')
export class Achievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  key: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'varchar',
  })
  @Index()
  category: AchievementCategory;

  @Column({
    type: 'varchar',
  })
  @Index()
  rarity: AchievementRarity;

  @Column()
  icon: string;

  @Column({ type: 'int', default: 0 })
  xpReward: number;

  @Column({ nullable: true })
  unlocksTitle: string | null;

  @Column({ type: 'jsonb' })
  condition: AchievementCondition;

  @OneToMany(() => UserAchievement, (userAchievement) => userAchievement.achievement)
  userAchievements: UserAchievement[];

  @CreateDateColumn()
  createdAt: Date;
}
