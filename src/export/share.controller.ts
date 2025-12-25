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
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { User } from '../users/user.entity';
import { Bet } from '../betting/entities/bet.entity';

@Controller('share')
export class ShareController {
  constructor(
    private readonly shareImageService: ShareImageService,
    private readonly imageStorageService: ImageStorageService,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
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
        throw new HttpException(
          'Achievement not found',
          HttpStatus.NOT_FOUND,
        );
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
  async shareStats(@CurrentUser('userId') userId: string): Promise<StreamableFile> {
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

      // Get bets to calculate stats
      const bets = await this.betRepository.find({
        where: { userId },
      });

      const finalizedBets = bets.filter((b) => b.isFinalized);
      const betsWon = finalizedBets.filter((b) => b.pointsEarned && b.pointsEarned > 0).length;
      const totalPoints = finalizedBets.reduce((sum, b) => sum + (b.pointsEarned || 0), 0);
      const winRate = finalizedBets.length > 0 ? (betsWon / finalizedBets.length) * 100 : 0;

      // Get current ranking (if available)
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const ranking = await this.userRepository.manager.findOne('bettor_rankings', {
        where: { userId, month: currentMonth, year: currentYear },
      }) as any;

      // Generate the image
      const imageBuffer = await this.shareImageService.generateStatsShareImage(
        `${user.firstName} ${user.lastName}`,
        {
          level: user.level,
          totalAchievements,
          unlockedAchievements,
          winRate,
          totalPoints,
          rank: ranking?.rank,
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

  /**
   * Generate a shareable perfect score celebration image
   * GET /api/share/perfect-score/:betId
   */
  @Get('perfect-score/:betId')
  @Header('Content-Type', 'image/png')
  async sharePerfectScore(
    @Param('betId') betId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<StreamableFile> {
    try {
      // Find the bet
      const bet = await this.betRepository.findOne({
        where: { id: betId, userId },
        relations: ['bettingWeek'],
      });

      if (!bet) {
        throw new HttpException('Bet not found', HttpStatus.NOT_FOUND);
      }

      // Verify it's a perfect score
      if (bet.pointsEarned !== 60) {
        throw new HttpException(
          'This bet is not a perfect score',
          HttpStatus.BAD_REQUEST,
        );
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
        await this.shareImageService.generatePerfectScoreShareImage(
          `${user.firstName} ${user.lastName}`,
          60,
          `Week ${bet.bettingWeek?.weekNumber || '?'} - ${bet.bettingWeek?.year || '?'}`,
        );

      return new StreamableFile(imageBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to generate perfect score share image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
