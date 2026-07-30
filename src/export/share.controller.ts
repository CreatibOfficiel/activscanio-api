/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Get,
  Param,
  HttpStatus,
  HttpException,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { ShareImageService } from '../image-generation/services/share-image.service';
import { ImageStorageService } from '../image-generation/services/image-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeasonUtils } from '../common/utils/season-utils';
import { WeekUtils } from '../common/utils/week-utils';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { User } from '../users/user.entity';

@Controller('share')
export class ShareController {
  constructor(
    private readonly shareImageService: ShareImageService,
    private readonly imageStorageService: ImageStorageService,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Generate a shareable image for an achievement
   * GET /api/share/achievement/:achievementId
   */
  @Get('achievement/:achievementId')
  @Header('Content-Type', 'image/png')
  async shareAchievement(
    @Param('achievementId') achievementId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<StreamableFile> {
    try {
      // Find the user achievement
      const userAchievement = await this.userAchievementRepository.findOne({
        where: { id: achievementId, userId },
        relations: ['achievement'],
      });

      if (!userAchievement) {
        throw new HttpException('Achievement not found', HttpStatus.NOT_FOUND);
      }

      // Get user info
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Generate the image
      const imageBuffer =
        await this.shareImageService.generateAchievementShareImage(
          `${user.firstName} ${user.lastName}`,
          {
            name: userAchievement.achievement.name,
            icon: userAchievement.achievement.icon,
            rarity: userAchievement.achievement.rarity,
            description: userAchievement.achievement.description,
          },
        );

      return new StreamableFile(imageBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to generate achievement share image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generate a shareable stats summary image
   * GET /api/share/stats
   */
  @Get('stats')
  @Header('Content-Type', 'image/png')
  async shareStats(
    @CurrentUser('userId') userId: string,
  ): Promise<StreamableFile> {
    try {
      // Get user
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Count unlocked achievements
      const unlockedAchievements = await this.userAchievementRepository.count({
        where: { userId },
      });

      // Count total achievements
      const totalAchievements = await this.userAchievementRepository.manager
        .getRepository('achievements')
        .count();



      // Generate the image
      const imageBuffer = await this.shareImageService.generateStatsShareImage(
        `${user.firstName} ${user.lastName}`,
        {
          level: user.level,
          totalAchievements,
          unlockedAchievements,
          // Betting figures went away with the betting module.
          winRate: 0,
          totalPoints: 0,
          rank: undefined,
        },
      );

      return new StreamableFile(imageBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to generate stats share image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

}
