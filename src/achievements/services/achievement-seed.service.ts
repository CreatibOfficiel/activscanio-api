import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from '../entities/achievement.entity';
import { ACHIEVEMENT_DEFINITIONS } from '../config/achievement-definitions';

@Injectable()
export class AchievementSeedService {
  private readonly logger = new Logger(AchievementSeedService.name);

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
  ) {}

  /**
   * Seed all achievement definitions into the database
   *
   * This method:
   * 1. Checks if achievements already exist
   * 2. Inserts new achievements
   * 3. Updates existing achievements (upsert behavior)
   *
   * @returns Number of achievements seeded
   */
  async seedAchievements(): Promise<number> {
    this.logger.log('Starting achievement seed...');

    let seededCount = 0;
    let updatedCount = 0;

    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      try {
        // Check if achievement already exists
        const existing = await this.achievementRepository.findOne({
          where: { key: definition.key },
        });

        if (existing) {
          // Update existing achievement
          await this.achievementRepository.update(
            { key: definition.key },
            {
              name: definition.name,
              description: definition.description,
              category: definition.category,
              rarity: definition.rarity,
              icon: definition.icon,
              xpReward: definition.xpReward,
              unlocksTitle: definition.unlocksTitle,
              condition: definition.condition,
            },
          );
          updatedCount++;
          this.logger.debug(`Updated achievement: ${definition.key}`);
        } else {
          // Create new achievement
          const achievement = this.achievementRepository.create(definition);
          await this.achievementRepository.save(achievement);
          seededCount++;
          this.logger.debug(`Created achievement: ${definition.key}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to seed achievement ${definition.key}: ${errorMessage}`,
        );
        throw error;
      }
    }

    this.logger.log(
      `Achievement seed completed: ${seededCount} created, ${updatedCount} updated`,
    );

    return seededCount + updatedCount;
  }

  /**
   * Get all seeded achievements
   */
  async getAllAchievements(): Promise<Achievement[]> {
    return await this.achievementRepository.find({
      order: {
        category: 'ASC',
        rarity: 'ASC',
        xpReward: 'ASC',
      },
    });
  }

  /**
   * Get achievement count by category
   */
  async getAchievementStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byRarity: Record<string, number>;
  }> {
    const achievements = await this.achievementRepository.find();

    const byCategory: Record<string, number> = {};
    const byRarity: Record<string, number> = {};

    for (const achievement of achievements) {
      // Count by category
      byCategory[achievement.category] =
        (byCategory[achievement.category] || 0) + 1;

      // Count by rarity
      byRarity[achievement.rarity] = (byRarity[achievement.rarity] || 0) + 1;
    }

    return {
      total: achievements.length,
      byCategory,
      byRarity,
    };
  }
}
