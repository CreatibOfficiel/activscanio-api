import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AchievementCalculatorService } from './services/achievement-calculator.service';
import { AchievementSeedService } from './services/achievement-seed.service';
import { XPLevelService } from './services/xp-level.service';
import { StreakTrackerService } from './services/streak-tracker.service';
import { LevelRewardsService } from './services/level-rewards.service';
import { StreakWarningService, StreakWarningStatus } from './services/streak-warning.service';
import { AdvancedStatsService } from '../betting/services/advanced-stats.service';
import { ConfigService } from '@nestjs/config';
import { ClerkGuard } from '../auth/clerk.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { AchievementQueryDto } from './dto/achievement-query.dto';
import { EquipTitleDto, EquipTitleResponseDto } from './dto/equip-title.dto';
import {
  AchievementResponseDto,
  UserAchievementResponseDto,
  UserStatsResponseDto,
} from './dto/achievement-response.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  Achievement,
  AchievementCategory,
  AchievementDomain,
  AchievementRarity,
} from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/user.entity';

@ApiTags('achievements')
@ApiBearerAuth()
@Controller('achievements')
@UseGuards(ClerkGuard)
export class AchievementsController {
  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly achievementCalculatorService: AchievementCalculatorService,
    private readonly achievementSeedService: AchievementSeedService,
    private readonly xpLevelService: XPLevelService,
    private readonly configService: ConfigService,
    private readonly streakTrackerService: StreakTrackerService,
    private readonly levelRewardsService: LevelRewardsService,
    private readonly advancedStatsService: AdvancedStatsService,
    private readonly streakWarningService: StreakWarningService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Helper method to get userId from clerkId
   */
  private async getUserIdFromClerkId(clerkId: string): Promise<string> {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) {
      throw new NotFoundException(`User with clerkId ${clerkId} not found`);
    }
    return user.id;
  }

  /**
   * Get all achievements with optional filters
   */
  @Get()
  @ApiOperation({ summary: 'Get all achievements with optional filters' })
  @ApiQuery({ name: 'category', required: false, enum: AchievementCategory })
  @ApiQuery({ name: 'rarity', required: false, enum: AchievementRarity })
  @ApiQuery({ name: 'domain', required: false, enum: AchievementDomain })
  @ApiQuery({ name: 'unlockedOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'lockedOnly', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'List of achievements',
    type: [AchievementResponseDto],
  })
  async getAchievements(
    @Query() query: AchievementQueryDto,
    @CurrentUser('clerkId') clerkId?: string,
  ): Promise<AchievementResponseDto[]> {
    // Build query
    const where: FindOptionsWhere<Achievement> = {};
    if (query.category) {
      where.category = query.category;
    }
    if (query.rarity) {
      where.rarity = query.rarity;
    }
    if (query.domain) {
      where.domain = query.domain;
    }

    const achievements = await this.achievementRepository.find({ where });

    // If user is authenticated, add unlock status and progress
    if (clerkId) {
      const userId = await this.getUserIdFromClerkId(clerkId);
      const unlockedAchievements = await this.userAchievementRepository.find({
        where: { userId },
      });

      const unlockedMap = new Map(
        unlockedAchievements.map((ua) => [ua.achievementId, ua]),
      );

      const results: AchievementResponseDto[] = [];

      for (const achievement of achievements) {
        const userAchievement = unlockedMap.get(achievement.id);
        const isUnlocked = !!userAchievement;

        // Apply filters
        if (query.unlockedOnly && !isUnlocked) continue;
        if (query.lockedOnly && isUnlocked) continue;

        // Get progress if not unlocked
        let progress = 0;
        if (!isUnlocked) {
          progress =
            await this.achievementCalculatorService.getAchievementProgress(
              userId,
              achievement.id,
            );
        }

        results.push({
          id: achievement.id,
          key: achievement.key,
          name: achievement.name,
          description: achievement.description,
          category: achievement.category,
          rarity: achievement.rarity,
          icon: achievement.icon,
          xpReward: achievement.xpReward,
          unlocksTitle: achievement.unlocksTitle,
          domain: achievement.domain,
          prerequisiteAchievementKey: achievement.prerequisiteAchievementKey,
          tierLevel: achievement.tierLevel,
          chainName: achievement.chainName,
          isTemporary: achievement.isTemporary,
          canBeLost: achievement.canBeLost,
          isUnlocked,
          unlockedAt: userAchievement?.unlockedAt || null,
          progress: isUnlocked ? 100 : progress,
        });
      }

      return results;
    }

    // If no user, return achievements without user-specific data
    return achievements.map((achievement) => ({
      id: achievement.id,
      key: achievement.key,
      name: achievement.name,
      description: achievement.description,
      category: achievement.category,
      rarity: achievement.rarity,
      icon: achievement.icon,
      xpReward: achievement.xpReward,
      unlocksTitle: achievement.unlocksTitle,
      domain: achievement.domain,
      prerequisiteAchievementKey: achievement.prerequisiteAchievementKey,
      tierLevel: achievement.tierLevel,
      chainName: achievement.chainName,
      isTemporary: achievement.isTemporary,
      canBeLost: achievement.canBeLost,
    }));
  }

  /**
   * Get current user's unlocked achievements
   */
  @Get('me')
  @ApiOperation({ summary: 'Get my unlocked achievements' })
  @ApiResponse({
    status: 200,
    description: 'List of unlocked achievements',
    type: [UserAchievementResponseDto],
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMyAchievements(
    @CurrentUser('clerkId') clerkId: string,
  ): Promise<UserAchievementResponseDto[]> {
    const userId = await this.getUserIdFromClerkId(clerkId);

    const userAchievements =
      await this.achievementCalculatorService.getUserAchievements(userId);

    return userAchievements.map((ua) => ({
      id: ua.id,
      achievementId: ua.achievementId,
      unlockedAt: ua.unlockedAt,
      notificationSent: ua.notificationSent,
      achievement: {
        key: ua.achievement.key,
        name: ua.achievement.name,
        description: ua.achievement.description,
        category: ua.achievement.category,
        rarity: ua.achievement.rarity,
        icon: ua.achievement.icon,
        xpReward: ua.achievement.xpReward,
        unlocksTitle: ua.achievement.unlocksTitle,
      },
    }));
  }

  /**
   * Get streak warning status for current user
   */
  @Get('streak-warnings/me')
  @ApiOperation({ summary: 'Get streak warning status for current user' })
  @ApiResponse({ status: 200, description: 'Streak warning status' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getStreakWarnings(
    @CurrentUser('clerkId') clerkId: string,
  ): Promise<StreakWarningStatus> {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return this.streakWarningService.getStreakWarningStatus(userId);
  }

  /**
   * Get user stats (can view others' stats or own)
   */
  @Get('stats/:userId')
  @ApiOperation({ summary: 'Get user achievement and betting stats' })
  @ApiParam({
    name: 'userId',
    description: 'User UUID or "me" for current user',
  })
  @ApiResponse({
    status: 200,
    description: 'User stats',
    type: UserStatsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserStats(
    @Param('userId') userIdParam: string,
    @CurrentUser('clerkId') clerkId?: string,
  ): Promise<UserStatsResponseDto> {
    let userId = userIdParam;

    // Handle "me" param
    if (userIdParam === 'me') {
      if (!clerkId) {
        throw new BadRequestException(
          'Authentication required for "me" parameter',
        );
      }
      userId = await this.getUserIdFromClerkId(clerkId);
    }

    // Get user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Get user stats from calculator service
    const userStats =
      await this.achievementCalculatorService['getUserStats'](userId);

    // Get XP info
    const currentLevel = user.level;
    const currentXP = user.xp;
    const xpForNextLevel = this.xpLevelService.getXPForLevel(currentLevel + 1);
    const xpForCurrentLevel = this.xpLevelService.getXPForLevel(currentLevel);
    const xpProgressPercent =
      ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) *
      100;

    // Get achievement count
    const totalAchievements = await this.achievementRepository.count();
    const unlockedAchievements = user.achievementCount;
    const achievementProgress =
      totalAchievements > 0 ? (unlockedAchievements / totalAchievements) * 100 : 0;

    return {
      userId: user.id,

      // XP and Level
      xp: currentXP,
      level: currentLevel,
      xpForNextLevel,
      xpProgressPercent: Math.max(0, Math.min(100, xpProgressPercent)),
      currentTitle: user.currentTitle,

      // Achievement stats
      totalAchievements,
      unlockedAchievements,
      achievementProgress,
      lastAchievementUnlockedAt: user.lastAchievementUnlockedAt,

      // From userStats
      totalBetsPlaced: userStats.totalBetsPlaced,
      totalBetsWon: userStats.totalBetsWon,
      totalPerfectBets: userStats.totalPerfectBets,
      totalPoints: userStats.totalPoints,
      winRate: userStats.winRate,

      currentMonthlyStreak: userStats.currentMonthlyStreak,
      longestLifetimeStreak: userStats.longestLifetimeStreak,
      currentLifetimeStreak: userStats.currentLifetimeStreak,
      currentWinStreak: userStats.currentWinStreak,
      bestWinStreak: userStats.bestWinStreak,

      monthlyBetsPlaced: userStats.monthlyBetsPlaced,
      monthlyBetsWon: userStats.monthlyBetsWon,
      monthlyPerfectBets: userStats.monthlyPerfectBets,
      monthlyPoints: userStats.monthlyPoints,
      monthlyRank: userStats.monthlyRank,

      bestMonthlyRank: userStats.bestMonthlyRank,
      consecutiveMonthlyWins: userStats.consecutiveMonthlyWins,

      totalBoostsUsed: userStats.totalBoostsUsed,
      highOddsWins: userStats.highOddsWins,
      boostedHighOddsWins: userStats.boostedHighOddsWins,
    };
  }

  /**
   * Equip a title from an unlocked achievement
   */
  @Post('equip-title')
  @ApiOperation({ summary: 'Equip a title from an unlocked achievement' })
  @ApiResponse({
    status: 200,
    description: 'Title equipped successfully',
    type: EquipTitleResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Achievement does not unlock a title or not unlocked',
  })
  @ApiResponse({ status: 404, description: 'Achievement or user not found' })
  async equipTitle(
    @CurrentUser('clerkId') clerkId: string,
    @Body() equipTitleDto: EquipTitleDto,
  ): Promise<EquipTitleResponseDto> {
    const userId = await this.getUserIdFromClerkId(clerkId);

    // Find achievement by key
    const achievement = await this.achievementRepository.findOne({
      where: { key: equipTitleDto.achievementKey },
    });

    if (!achievement) {
      throw new NotFoundException(
        `Achievement ${equipTitleDto.achievementKey} not found`,
      );
    }

    // Check if achievement unlocks a title
    if (!achievement.unlocksTitle) {
      throw new BadRequestException(
        `Achievement ${achievement.name} does not unlock a title`,
      );
    }

    // Check if user has unlocked this achievement
    const userAchievement = await this.userAchievementRepository.findOne({
      where: { userId, achievementId: achievement.id },
    });

    if (!userAchievement) {
      throw new BadRequestException(
        `You have not unlocked the achievement "${achievement.name}"`,
      );
    }

    // Equip title
    await this.userRepository.update(
      { id: userId },
      { currentTitle: achievement.unlocksTitle },
    );

    return {
      userId,
      currentTitle: achievement.unlocksTitle,
      equippedAt: new Date(),
      message: `Title "${achievement.unlocksTitle}" equipped successfully`,
    };
  }

  /**
   * Unequip current title (set to null)
   */
  @Post('unequip-title')
  @ApiOperation({ summary: 'Remove currently equipped title' })
  @ApiResponse({ status: 200, description: 'Title removed successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unequipTitle(
    @CurrentUser('clerkId') clerkId: string,
  ): Promise<{ message: string }> {
    const userId = await this.getUserIdFromClerkId(clerkId);

    await this.userRepository.update({ id: userId }, { currentTitle: null });

    return {
      message: 'Title removed successfully',
    };
  }

  /**
   * Get stats history for graphs
   */
  @Get('stats/:userId/history')
  @ApiOperation({ summary: 'Get user stats history for graphs' })
  @ApiParam({
    name: 'userId',
    description: 'User UUID or "me" for current user',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['7d', '30d', '3m', '1y'],
  })
  @ApiResponse({ status: 200, description: 'Daily stats history' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getStatsHistory(
    @Param('userId') userIdParam: string,
    @Query('period') period: '7d' | '30d' | '3m' | '1y' = '30d',
    @CurrentUser('clerkId') clerkId?: string,
  ) {
    let userId = userIdParam;
    if (userIdParam === 'me') {
      if (!clerkId) {
        throw new BadRequestException('Authentication required for "me"');
      }
      userId = await this.getUserIdFromClerkId(clerkId);
    }

    return await this.advancedStatsService.getStatsHistory(userId, period);
  }

  /**
   * Get comparison stats (user vs average)
   */
  @Get('stats/:userId/comparison')
  @ApiOperation({ summary: 'Compare user stats with average' })
  @ApiParam({
    name: 'userId',
    description: 'User UUID or "me" for current user',
  })
  @ApiResponse({ status: 200, description: 'Comparison data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getStatsComparison(
    @Param('userId') userIdParam: string,
    @CurrentUser('clerkId') clerkId?: string,
  ) {
    let userId = userIdParam;
    if (userIdParam === 'me') {
      if (!clerkId) {
        throw new BadRequestException('Authentication required for "me"');
      }
      userId = await this.getUserIdFromClerkId(clerkId);
    }

    return await this.advancedStatsService.getComparisonStats(userId);
  }

  /**
   * Get advanced stats (best day, patterns, etc.)
   */
  @Get('stats/:userId/advanced')
  @ApiOperation({ summary: 'Get advanced user stats' })
  @ApiParam({
    name: 'userId',
    description: 'User UUID or "me" for current user',
  })
  @ApiResponse({ status: 200, description: 'Advanced stats data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getAdvancedStats(
    @Param('userId') userIdParam: string,
    @CurrentUser('clerkId') clerkId?: string,
  ) {
    let userId = userIdParam;
    if (userIdParam === 'me') {
      if (!clerkId) {
        throw new BadRequestException('Authentication required for "me"');
      }
      userId = await this.getUserIdFromClerkId(clerkId);
    }

    const [bestDay, favoriteCompetitors, patterns, winRateTrend] =
      await Promise.all([
        this.advancedStatsService.getBestDayOfWeek(userId),
        this.advancedStatsService.getFavoriteCompetitors(userId, 5),
        this.advancedStatsService.getBettingPatterns(userId),
        this.advancedStatsService.getWinRateTrend(userId, 30),
      ]);

    return {
      bestDay,
      favoriteCompetitors,
      patterns,
      winRateTrend,
    };
  }

  /**
   * Get XP history
   */
  @Get('xp-history/:userId')
  @ApiOperation({ summary: 'Get user XP history' })
  @ApiParam({
    name: 'userId',
    description: 'User UUID or "me" for current user',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'XP history entries' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getXPHistory(
    @Param('userId') userIdParam: string,
    @Query('limit') limit: number = 50,
    @CurrentUser('clerkId') clerkId?: string,
  ) {
    let userId = userIdParam;
    if (userIdParam === 'me') {
      if (!clerkId) {
        throw new BadRequestException('Authentication required for "me"');
      }
      userId = await this.getUserIdFromClerkId(clerkId);
    }

    return await this.xpLevelService.getXPHistory(userId, limit);
  }

  /**
   * Get all level rewards
   */
  @Get('level-rewards')
  @ApiOperation({ summary: 'Get all level rewards' })
  @ApiResponse({ status: 200, description: 'List of all level rewards' })
  async getLevelRewards() {
    return await this.levelRewardsService.getAllRewards();
  }

  /**
   * Get unlocked rewards for a user
   */
  @Get('level-rewards/:userId')
  @ApiOperation({ summary: 'Get unlocked rewards for a user' })
  @ApiParam({
    name: 'userId',
    description: 'User UUID or "me" for current user',
  })
  @ApiResponse({ status: 200, description: 'Unlocked rewards' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUnlockedRewards(
    @Param('userId') userIdParam: string,
    @CurrentUser('clerkId') clerkId?: string,
  ) {
    let userId = userIdParam;
    if (userIdParam === 'me') {
      if (!clerkId) {
        throw new BadRequestException('Authentication required for "me"');
      }
      userId = await this.getUserIdFromClerkId(clerkId);
    }

    const [unlockedRewards, nextReward, activeMultiplier] = await Promise.all([
      this.levelRewardsService.getUnlockedRewards(userId),
      this.levelRewardsService.getNextReward(userId),
      this.levelRewardsService.getActiveXPMultiplier(userId),
    ]);

    return {
      unlockedRewards,
      nextReward,
      activeMultiplier,
    };
  }

  /**
   * Admin endpoint: seed achievements + backfill racing achievements for competitors
   * Protected by ADMIN_SECRET query parameter
   */
  @Public()
  @Post('admin/seed-and-backfill')
  @ApiOperation({
    summary: 'Seed achievements and backfill racing achievements for competitors',
  })
  @ApiQuery({ name: 'secret', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Seed and backfill completed' })
  @ApiResponse({ status: 403, description: 'Invalid admin secret' })
  async seedAndBackfill(
    @Query('secret') secret: string,
  ): Promise<{
    seeded: number;
    backfillResults: { userId: string; unlocked: string[] }[];
  }> {
    const adminSecret = this.configService.get<string>('ADMIN_SECRET');
    if (!adminSecret || secret !== adminSecret) {
      throw new ForbiddenException('Invalid admin secret');
    }

    // 1. Seed achievements
    const seeded = await this.achievementSeedService.seedAchievements();

    // 2. Find all users with a competitorId (they are competitors)
    const competitorUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.competitorId IS NOT NULL')
      .getMany();

    // 3. Backfill: check achievements for each competitor user
    const backfillResults: { userId: string; unlocked: string[] }[] = [];

    for (const user of competitorUsers) {
      const unlocked = await this.achievementCalculatorService.checkAchievements(
        user.id,
      );
      if (unlocked.length > 0) {
        backfillResults.push({
          userId: user.id,
          unlocked: unlocked.map((a) => a.achievementKey),
        });
      }
    }

    return { seeded, backfillResults };
  }
}
