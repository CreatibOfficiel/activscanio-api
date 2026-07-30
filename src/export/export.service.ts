import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parser } from 'json2csv';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { User } from '../users/user.entity';
import { AchievementRarity } from '../achievements/entities/achievement.entity';

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Export user's achievements to CSV
   */
  async exportAchievementsToCSV(userId: string): Promise<string> {
    const achievements = await this.userAchievementRepository.find({
      where: { userId },
      relations: ['achievement'],
      order: { unlockedAt: 'DESC' },
    });

    const data = achievements.map((ua) => ({
      Name: ua.achievement.name,
      Description: ua.achievement.description,
      Category: ua.achievement.category,
      Rarity: ua.achievement.rarity,
      'XP Reward': ua.achievement.xpReward,
      'Unlocked At': ua.unlockedAt.toISOString(),
      'Tier Level': ua.achievement.tierLevel || 0,
      'Chain Name': ua.achievement.chainName || '-',
      Temporary: ua.achievement.isTemporary ? 'Yes' : 'No',
    }));

    const parser = new Parser({
      fields: [
        'Name',
        'Description',
        'Category',
        'Rarity',
        'XP Reward',
        'Unlocked At',
        'Tier Level',
        'Chain Name',
        'Temporary',
      ],
    });
    return parser.parse(data);
  }


  /**
   * Export complete user stats to JSON
   */
  async exportStatsToJSON(userId: string): Promise<any> {
    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get achievements
    const achievements = await this.userAchievementRepository.find({
      where: { userId },
      relations: ['achievement'],
    });


    return {
      user: {
        userId,
        level: user.level,
        xp: user.xp,
        currentTitle: user.currentTitle,
        achievementCount: user.achievementCount,
      },
      stats: {
        achievements: {
          total: achievements.length,
          byRarity: {
            common: achievements.filter(
              (a) => a.achievement.rarity === AchievementRarity.COMMON,
            ).length,
            rare: achievements.filter(
              (a) => a.achievement.rarity === AchievementRarity.RARE,
            ).length,
            epic: achievements.filter(
              (a) => a.achievement.rarity === AchievementRarity.EPIC,
            ).length,
            legendary: achievements.filter(
              (a) => a.achievement.rarity === AchievementRarity.LEGENDARY,
            ).length,
          },
          byCategory: achievements.reduce(
            (acc, a) => {
              acc[a.achievement.category] =
                (acc[a.achievement.category] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
        },
      },
      achievements: achievements.map((ua) => ({
        key: ua.achievement.key,
        name: ua.achievement.name,
        rarity: ua.achievement.rarity,
        category: ua.achievement.category,
        xpReward: ua.achievement.xpReward,
        unlockedAt: ua.unlockedAt,
        tierLevel: ua.achievement.tierLevel,
        chainName: ua.achievement.chainName,
      })),
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        source: 'ActivScanIO Export API',
      },
    };
  }

}
