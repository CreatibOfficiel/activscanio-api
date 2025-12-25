import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { XP_SOURCES, LEVEL_FORMULA } from '../config/xp-sources.config';
import { XPHistory } from '../entities/xp-history.entity';
import { XPSource } from '../enums/xp-source.enum';

// Re-export for backward compatibility
export { XPSource } from '../enums/xp-source.enum';

@Injectable()
export class XPLevelService {
  private readonly logger = new Logger(XPLevelService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(XPHistory)
    private readonly xpHistoryRepository: Repository<XPHistory>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Add XP to a user and check for level up
   *
   * @param userId - User ID
   * @param amount - XP amount to add
   * @param source - Source of XP (for logging)
   * @param relatedEntityId - Optional related entity ID (betId, achievementId, etc.)
   * @param description - Optional description
   * @returns Updated user with new XP and level
   */
  async addXP(
    userId: string,
    amount: number,
    source: string,
    relatedEntityId: string | null = null,
    description: string | null = null,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const previousXP = user.xp;
    const previousLevel = user.level;

    // Add XP
    user.xp += amount;

    // Track XP history
    await this.xpHistoryRepository.save({
      userId,
      xpAmount: amount,
      source: source as XPSource,
      relatedEntityId,
      description,
    });

    // Calculate new level
    const newLevel = this.calculateLevel(user.xp);

    // Check for level up
    if (newLevel > previousLevel) {
      user.level = newLevel;

      this.logger.log(
        `User ${userId} leveled up! ${previousLevel} → ${newLevel} (XP: ${previousXP} → ${user.xp}, source: ${source})`,
      );

      // Emit level up event
      this.eventEmitter.emit('user.level_up', {
        userId,
        newLevel,
        previousLevel,
        totalXP: user.xp,
      });

      // Award bonus XP for leveling up (doesn't cause recursive level up)
      if (source !== XPSource.LEVEL_UP_BONUS) {
        user.xp += XP_SOURCES.LEVEL_UP_BONUS;

        // Track level up bonus
        await this.xpHistoryRepository.save({
          userId,
          xpAmount: XP_SOURCES.LEVEL_UP_BONUS,
          source: XPSource.LEVEL_UP_BONUS,
          relatedEntityId: null,
          description: `Level up bonus (${previousLevel} → ${newLevel})`,
        });

        this.logger.log(
          `User ${userId} received ${XP_SOURCES.LEVEL_UP_BONUS} bonus XP for leveling up`,
        );
      }
    } else {
      this.logger.debug(
        `User ${userId} gained ${amount} XP from ${source} (${previousXP} → ${user.xp})`,
      );
    }

    // Save and return
    return await this.userRepository.save(user);
  }

  /**
   * Calculate level based on total XP
   *
   * Formula: XP for level N = 100 * N * (N + 1) / 2
   *
   * @param totalXP - Total XP accumulated
   * @returns Current level
   */
  calculateLevel(totalXP: number): number {
    if (totalXP < 0) return 1;

    let level = 1;
    while (this.getXPForLevel(level + 1) <= totalXP) {
      level++;
    }
    return level;
  }

  /**
   * Get total XP required to reach a specific level
   *
   * @param level - Target level
   * @returns Total XP required
   */
  getXPForLevel(level: number): number {
    if (level <= 1) return 0;
    return (LEVEL_FORMULA.BASE_MULTIPLIER * level * (level + 1)) / 2;
  }

  /**
   * Get XP required to reach next level from current level
   *
   * @param currentLevel - Current level
   * @returns XP needed for next level
   */
  getXPForNextLevel(currentLevel: number): number {
    const currentLevelXP = this.getXPForLevel(currentLevel);
    const nextLevelXP = this.getXPForLevel(currentLevel + 1);
    return nextLevelXP - currentLevelXP;
  }

  /**
   * Get XP remaining until next level
   *
   * @param currentXP - Current total XP
   * @param currentLevel - Current level
   * @returns XP remaining
   */
  getXPToNextLevel(currentXP: number, currentLevel: number): number {
    const nextLevelXP = this.getXPForLevel(currentLevel + 1);
    return Math.max(0, nextLevelXP - currentXP);
  }

  /**
   * Get progression percentage to next level
   *
   * @param currentXP - Current total XP
   * @param currentLevel - Current level
   * @returns Percentage (0-100)
   */
  getLevelProgress(currentXP: number, currentLevel: number): number {
    const currentLevelXP = this.getXPForLevel(currentLevel);
    const nextLevelXP = this.getXPForLevel(currentLevel + 1);
    const xpInCurrentLevel = currentXP - currentLevelXP;
    const xpNeededForLevel = nextLevelXP - currentLevelXP;

    if (xpNeededForLevel === 0) return 100;

    return Math.min(
      100,
      Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100),
    );
  }

  /**
   * Get user level info
   *
   * @param userId - User ID
   * @returns Level info with progression
   */
  async getUserLevelInfo(userId: string): Promise<{
    level: number;
    xp: number;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    xpToNextLevel: number;
    progress: number;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return {
      level: user.level,
      xp: user.xp,
      xpForCurrentLevel: this.getXPForLevel(user.level),
      xpForNextLevel: this.getXPForLevel(user.level + 1),
      xpToNextLevel: this.getXPToNextLevel(user.xp, user.level),
      progress: this.getLevelProgress(user.xp, user.level),
    };
  }

  /**
   * Get top users by level and XP
   *
   * @param limit - Number of users to return
   * @returns Top users
   */
  async getTopUsersByLevel(limit: number = 10): Promise<User[]> {
    return await this.userRepository.find({
      order: {
        level: 'DESC',
        xp: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Award XP based on source enum
   *
   * @param userId - User ID
   * @param source - XP source enum
   * @param customAmount - Optional custom amount (overrides source default)
   * @param relatedEntityId - Optional related entity ID
   * @param description - Optional description
   * @returns Updated user
   */
  async awardXP(
    userId: string,
    source: XPSource,
    customAmount: number | null = null,
    relatedEntityId: string | null = null,
    description: string | null = null,
  ): Promise<User> {
    const amount = customAmount ?? XP_SOURCES[source] ?? 0;
    return await this.addXP(userId, amount, source, relatedEntityId, description);
  }

  /**
   * Get XP history for a user
   *
   * @param userId - User ID
   * @param limit - Number of records to return
   * @returns XP history records
   */
  async getXPHistory(userId: string, limit: number = 50): Promise<XPHistory[]> {
    return await this.xpHistoryRepository.find({
      where: { userId },
      order: { earnedAt: 'DESC' },
      take: limit,
    });
  }
}
