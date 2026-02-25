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
  EQ = 'eq', // Equal
}

export enum AchievementScope {
  LIFETIME = 'LIFETIME',
  MONTHLY = 'MONTHLY',
}

export enum AchievementDomain {
  BETTING = 'BETTING',
  RACING = 'RACING',
}

export interface AchievementCondition {
  type: AchievementConditionType;
  metric: string; // e.g., 'betsPlaced', 'perfectBets', 'rank', 'winRate'
  operator: AchievementConditionOperator;
  value: number;
  scope?: AchievementScope;
  minCount?: { metric: string; value: number };
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

  @Column({ type: 'varchar', nullable: true })
  unlocksTitle: string | null;

  @Column({ type: 'jsonb' })
  condition: AchievementCondition;

  @Column({ type: 'varchar', nullable: true })
  prerequisiteAchievementKey: string | null;

  @Column({ type: 'boolean', default: false })
  isTemporary: boolean;

  @Column({ type: 'boolean', default: false })
  canBeLost: boolean;

  @Column({ type: 'varchar', default: AchievementDomain.BETTING })
  @Index()
  domain: AchievementDomain;

  @Column({ type: 'int', default: 0 })
  tierLevel: number; // For progressive chains (1, 2, 3, 4)

  @Column({ type: 'varchar', nullable: true })
  chainName: string | null; // e.g., "perfect_podium_chain"

  @OneToMany(
    () => UserAchievement,
    (userAchievement) => userAchievement.achievement,
  )
  userAchievements: UserAchievement[];

  @CreateDateColumn()
  createdAt: Date;
}
