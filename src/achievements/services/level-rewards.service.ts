import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LevelReward, RewardType } from '../entities/level-reward.entity';
import { User } from '../../users/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Level rewards configuration
 * Defines what rewards are unlocked at each level
 */
export const LEVEL_REWARDS_CONFIG = [
  {
    level: 5,
    rewardType: RewardType.TITLE,
    rewardData: { title: 'Rookie' },
    description: 'Unlock the "Rookie" title',
  },
  {
    level: 10,
    rewardType: RewardType.BADGE,
    rewardData: { badgeIcon: '🌟' },
    description: 'Unlock the Star badge',
  },
  {
    level: 15,
    rewardType: RewardType.TITLE,
    rewardData: { title: 'Pro' },
    description: 'Unlock the "Pro" title',
  },
  {
    level: 20,
    rewardType: RewardType.XP_MULTIPLIER,
    rewardData: { multiplier: 1.1 },
    description: '10% XP multiplier',
  },
  {
    level: 25,
    rewardType: RewardType.TITLE,
    rewardData: { title: 'Expert' },
    description: 'Unlock the "Expert" title',
  },
  {
    level: 30,
    rewardType: RewardType.XP_MULTIPLIER,
    rewardData: { multiplier: 1.2 },
    description: '20% XP multiplier',
  },
  {
    level: 35,
    rewardType: RewardType.BADGE,
    rewardData: { badgeIcon: '⭐' },
    description: 'Unlock the Superstar badge',
  },
  {
    level: 40,
    rewardType: RewardType.TITLE,
    rewardData: { title: 'Master' },
    description: 'Unlock the "Master" title',
  },
  {
    level: 50,
    rewardType: RewardType.XP_MULTIPLIER,
    rewardData: { multiplier: 1.5 },
    description: '50% XP multiplier',
  },
  {
    level: 60,
    rewardType: RewardType.TITLE,
    rewardData: { title: 'Grandmaster' },
    description: 'Unlock the "Grandmaster" title',
  },
  {
    level: 75,
    rewardType: RewardType.XP_MULTIPLIER,
    rewardData: { multiplier: 2.0 },
    description: '100% XP multiplier (2x XP)',
  },
  {
    level: 100,
    rewardType: RewardType.TITLE,
    rewardData: { title: 'Legend' },
    description: 'Unlock the "Legend" title',
  },
];

@Injectable()
export class LevelRewardsService {
  private readonly logger = new Logger(LevelRewardsService.name);

  constructor(
    @InjectRepository(LevelReward)
    private readonly levelRewardRepository: Repository<LevelReward>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check and award level up rewards
   *
   * @param userId - User ID
   * @param newLevel - New level reached
   */
  async checkLevelUpRewards(
    userId: string,
    newLevel: number,
  ): Promise<LevelReward | null> {
    // Check if there's a reward for this level
    const reward = await this.levelRewardRepository.findOne({
      where: { level: newLevel },
    });

    if (reward) {
      this.logger.log(
        `User ${userId} unlocked level ${newLevel} reward: ${reward.description}`,
      );

      // Emit event for reward unlock
      this.eventEmitter.emit('reward.unlocked', {
        userId,
        level: newLevel,
        reward,
      });

      return reward;
    }

    return null;
  }

  /**
   * Get all rewards unlocked by a user based on their level
   *
   * @param userId - User ID
   * @returns List of unlocked rewards
   */
  async getUnlockedRewards(userId: string): Promise<LevelReward[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Get all rewards for levels <= user's current level
    return await this.levelRewardRepository
      .createQueryBuilder('reward')
      .where('reward.level <= :level', { level: user.level })
      .orderBy('reward.level', 'ASC')
      .getMany();
  }

  /**
   * Get next reward to unlock
   *
   * @param userId - User ID
   * @returns Next reward or null if none
   */
  async getNextReward(userId: string): Promise<LevelReward | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Get next reward after user's current level
    return await this.levelRewardRepository
      .createQueryBuilder('reward')
      .where('reward.level > :level', { level: user.level })
      .orderBy('reward.level', 'ASC')
      .getOne();
  }

  /**
   * Get all level rewards (for display purposes)
   *
   * @returns All level rewards
   */
  async getAllRewards(): Promise<LevelReward[]> {
    return await this.levelRewardRepository.find({
      order: {
        level: 'ASC',
      },
    });
  }

  /**
   * Get active XP multiplier for a user based on their level
   *
   * @param userId - User ID
   * @returns XP multiplier (1.0 = no multiplier)
   */
  async getActiveXPMultiplier(userId: string): Promise<number> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      return 1.0;
    }

    // Get all XP multiplier rewards unlocked by the user
    const multiplierRewards = await this.levelRewardRepository
      .createQueryBuilder('reward')
      .where('reward.level <= :level', { level: user.level })
      .andWhere("reward.rewardType = 'XP_MULTIPLIER'")
      .orderBy('reward.level', 'DESC')
      .getMany();

    if (multiplierRewards.length === 0) {
      return 1.0;
    }

    // Return the highest multiplier (latest level)
    const highestMultiplier = multiplierRewards[0];
    return (highestMultiplier.rewardData.multiplier as number) || 1.0;
  }

  /**
   * Apply XP multiplier to base XP amount
   *
   * @param userId - User ID
   * @param baseXP - Base XP amount
   * @returns XP after applying multiplier
   */
  async applyXPMultiplier(userId: string, baseXP: number): Promise<number> {
    const multiplier = await this.getActiveXPMultiplier(userId);
    return Math.floor(baseXP * multiplier);
  }

  /**
   * Seed level rewards into database
   * Should be called once during setup
   */
  async seedLevelRewards(): Promise<void> {
    this.logger.log('Seeding level rewards...');

    for (const rewardConfig of LEVEL_REWARDS_CONFIG) {
      // Check if reward already exists
      const existing = await this.levelRewardRepository.findOne({
        where: { level: rewardConfig.level },
      });

      if (existing) {
        // Update existing
        existing.rewardType = rewardConfig.rewardType;
        existing.rewardData = rewardConfig.rewardData;
        existing.description = rewardConfig.description;
        await this.levelRewardRepository.save(existing);
        this.logger.debug(`Updated reward for level ${rewardConfig.level}`);
      } else {
        // Create new
        const reward = this.levelRewardRepository.create(rewardConfig);
        await this.levelRewardRepository.save(reward);
        this.logger.debug(`Created reward for level ${rewardConfig.level}`);
      }
    }

    this.logger.log(
      `Level rewards seeded successfully (${LEVEL_REWARDS_CONFIG.length} rewards)`,
    );
  }
}
