import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  Achievement,
  AchievementCondition,
  AchievementConditionOperator,
  AchievementDomain,
  AchievementScope,
} from '../entities/achievement.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
import { UserStreak } from '../entities/user-streak.entity';
import { User } from '../../users/user.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { PingpongPlayer } from '../../pingpong/entities/pingpong-player.entity';
import {
  PingpongHighlightStatsService,
  EMPTY_HIGHLIGHT_STATS,
} from '../../pingpong/services/pingpong-highlight-stats.service';
import { RaceCreatedEvent } from '../../races/events/race-created.event';
import { XPLevelService, XPSource } from './xp-level.service';
import {
  UserStats,
  AchievementUnlockResult,
} from '../types/achievement-calculator.types';

@Injectable()
export class AchievementCalculatorService {
  private readonly logger = new Logger(AchievementCalculatorService.name);

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(PingpongPlayer)
    private readonly pingpongPlayerRepository: Repository<PingpongPlayer>,
    private readonly pingpongHighlightStatsService: PingpongHighlightStatsService,
    private readonly xpLevelService: XPLevelService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Listen to race.created events and check racing achievements for competitors
   */
  @OnEvent('race.created')
  async handleRaceCreated(event: RaceCreatedEvent): Promise<void> {
    const race = event.race;
    if (!race.results || race.results.length === 0) return;

    const competitorIds = [...new Set(race.results.map((r) => r.competitorId))];

    // Find users linked to these competitors
    const users = await this.userRepository.find({
      where: competitorIds.map((cid) => ({ competitorId: cid })),
    });

    for (const user of users) {
      try {
        this.logger.log(
          `Checking racing achievements for user ${user.id} after race created`,
        );

        const unlockedAchievements = await this.checkAchievements(user.id);

        for (const achievement of unlockedAchievements) {
          this.eventEmitter.emit('achievement.unlocked', {
            userId: user.id,
            achievement,
            unlockedAt: achievement.unlockedAt,
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to check racing achievements for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Check and unlock achievements for a user
   *
   * @param userId - User ID
   * @returns List of newly unlocked achievements
   */

  async checkAchievements(userId: string): Promise<AchievementUnlockResult[]> {
    // Get user stats
    const userStats = await this.getUserStats(userId);

    // Get all achievements
    const allAchievements = await this.achievementRepository.find();

    // Get already unlocked achievements
    const unlockedAchievementIds = await this.userAchievementRepository
      .find({
        where: { userId },
        select: ['achievementId'],
      })
      .then((results) => results.map((r) => r.achievementId));

    const unlockedSet = new Set(unlockedAchievementIds);

    // Check each achievement
    const newlyUnlocked: AchievementUnlockResult[] = [];

    // Get unlocked achievements with their keys for prerequisite checking
    const unlockedAchievements = await this.userAchievementRepository.find({
      where: { userId, revokedAt: IsNull() },
      relations: ['achievement'],
    });
    const unlockedKeys = new Set(
      unlockedAchievements.map((ua) => ua.achievement.key),
    );

    for (const achievement of allAchievements) {
      // Skip if already unlocked
      if (unlockedSet.has(achievement.id)) {
        continue;
      }

      // Skip RACING achievements for non-competitors
      if (
        achievement.domain === AchievementDomain.RACING &&
        !userStats.isCompetitor
      ) {
        continue;
      }

      // Skip PINGPONG achievements for people who do not play it
      if (
        achievement.domain === AchievementDomain.PINGPONG &&
        !userStats.isPingpongPlayer
      ) {
        continue;
      }

      // Check prerequisite
      if (achievement.prerequisiteAchievementKey) {
        if (!unlockedKeys.has(achievement.prerequisiteAchievementKey)) {
          // Prerequisite not unlocked, skip this achievement
          continue;
        }
      }

      // Evaluate condition
      const isUnlocked = this.evaluateCondition(
        achievement.condition,
        userStats,
      );

      if (isUnlocked) {
        // Create UserAchievement
        const userAchievement = this.userAchievementRepository.create({
          userId,
          achievementId: achievement.id,
          unlockedAt: new Date(),
          notificationSent: false,
        });

        await this.userAchievementRepository.save(userAchievement);

        // Update user achievement count
        await this.userRepository.increment(
          { id: userId },
          'achievementCount',
          1,
        );
        await this.userRepository.update(
          { id: userId },
          { lastAchievementUnlockedAt: new Date() },
        );

        // Award XP based on rarity
        const xpSource = `ACHIEVEMENT_${achievement.rarity}` as XPSource;
        await this.xpLevelService.awardXP(userId, xpSource);

        // Add to results
        newlyUnlocked.push({
          achievementId: achievement.id,
          achievementKey: achievement.key,
          achievementName: achievement.name,
          xpReward: achievement.xpReward,
          unlocksTitle: achievement.unlocksTitle,
          unlockedAt: userAchievement.unlockedAt,
        });

        this.logger.log(
          `Achievement unlocked: ${achievement.key} for user ${userId}`,
        );
      }
    }

    return newlyUnlocked;
  }

  /**
   * Evaluate an achievement condition
   *
   * @param condition - Achievement condition
   * @param userStats - User statistics
   * @returns True if condition is met
   */
  private evaluateCondition(
    condition: AchievementCondition,
    userStats: UserStats,
  ): boolean {
    // Check minimum threshold first (e.g., "50% win rate on 20+ bets")
    if (condition.minCount) {
      const minValue = this.getMetricValue(
        userStats,
        condition.minCount.metric,
        condition.scope,
      );
      if (minValue < condition.minCount.value) return false;
    }

    const actualValue = this.getMetricValue(
      userStats,
      condition.metric,
      condition.scope,
    );

    switch (condition.operator) {
      case AchievementConditionOperator.GTE:
        return actualValue >= condition.value;
      case AchievementConditionOperator.LTE:
        return actualValue <= condition.value;
      case AchievementConditionOperator.EQ:
        return actualValue === condition.value;
      default:
        this.logger.warn(`Unknown operator: ${String(condition.operator)}`);
        return false;
    }
  }

  /**
   * Get metric value from user stats
   *
   * @param userStats - User statistics
   * @param metric - Metric name
   * @param scope - Scope (LIFETIME or MONTHLY)
   * @returns Metric value
   */
  private getMetricValue(
    userStats: UserStats,
    metric: string,
    scope?: AchievementScope,
  ): number {
    // Determine if we should use monthly or lifetime stats
    const isMonthly = scope === AchievementScope.MONTHLY;
    void isMonthly;

    switch (metric) {
      // Competitor (racing) metrics
      case 'competitorTotalWins':
        return userStats.competitorTotalWins;
      case 'competitorRaceCount':
        return userStats.competitorRaceCount;
      case 'competitorWinStreak':
        return userStats.competitorWinStreak;
      case 'competitorBestWinStreak':
        return userStats.competitorBestWinStreak;
      case 'competitorPlayStreak':
        return userStats.competitorPlayStreak;
      case 'competitorBestPlayStreak':
        return userStats.competitorBestPlayStreak;
      case 'competitorRating':
        return userStats.competitorRating;
      case 'competitorAvgRank12':
        return userStats.competitorAvgRank12;

      // Ping-pong metrics
      case 'pingpongMatchCount':
        return userStats.pingpongMatchCount;
      case 'pingpongWeightedMatchCount':
        return userStats.pingpongWeightedMatchCount;
      case 'pingpongWins':
        return userStats.pingpongWins;
      case 'pingpongLosses':
        return userStats.pingpongLosses;
      case 'pingpongSetsWon':
        return userStats.pingpongSetsWon;
      case 'pingpongCurrentStreak':
        return userStats.pingpongCurrentStreak;
      case 'pingpongBestStreak':
        return userStats.pingpongBestStreak;
      case 'pingpongRating':
        return userStats.pingpongRating;
      case 'pingpongDistinctOpponents':
        return userStats.pingpongDistinctOpponents;
      case 'pingpongDiversityScore':
        return userStats.pingpongDiversityScore;

      // Per-match feats, replayed from the match log rather than read off a
      // column: a shutout set only exists inside one match.
      case 'pingpongShutoutSetsDealt':
        return userStats.pingpongShutoutSetsDealt;
      case 'pingpongShutoutSetsConceded':
        return userStats.pingpongShutoutSetsConceded;
      case 'pingpongComebacks':
        return userStats.pingpongComebacks;
      case 'pingpongDeuceSetsWon':
        return userStats.pingpongDeuceSetsWon;
      case 'pingpongUpsets':
        return userStats.pingpongUpsets;
      case 'pingpongBiggestUpsetGap':
        return userStats.pingpongBiggestUpsetGap;
      case 'pingpongHeists':
        return userStats.pingpongHeists;

      default:
        this.logger.warn(`Unknown metric: ${metric}`);
        return 0;
    }
  }

  /**
   * Get aggregated user statistics
   *
   * @param userId - User ID
   * @returns User statistics
   */
  private async getUserStats(userId: string): Promise<UserStats> {
    const userStreak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    // Load competitor stats if the user is linked to one
    const user = await this.userRepository.findOne({ where: { id: userId } });
    let isCompetitor = false;
    let competitor: Competitor | null = null;

    if (user?.competitorId) {
      competitor = await this.competitorRepository.findOne({
        where: { id: user.competitorId },
      });
      isCompetitor = !!competitor;
    }

    let pingpongPlayer: PingpongPlayer | null = null;
    if (user?.competitorId) {
      pingpongPlayer = await this.pingpongPlayerRepository.findOne({
        where: { competitorId: user.competitorId },
      });
    }

    // Only replay the match log for someone who actually has one. For the
    // rest — every Mario Kart-only player — this stays zero without a query.
    const highlights = pingpongPlayer
      ? await this.pingpongHighlightStatsService.computeFor(pingpongPlayer.id)
      : EMPTY_HIGHLIGHT_STATS;

    return {
      userId,
      currentMonthlyStreak: userStreak?.currentMonthlyStreak || 0,
      longestLifetimeStreak: userStreak?.longestLifetimeStreak || 0,
      currentLifetimeStreak: userStreak?.currentLifetimeStreak || 0,
      currentWinStreak: userStreak?.currentWinStreak || 0,
      bestWinStreak: userStreak?.bestWinStreak || 0,
      isCompetitor,
      competitorTotalWins: competitor?.totalWins ?? 0,
      competitorRaceCount: competitor?.raceCount ?? 0,
      competitorWinStreak: competitor?.winStreak ?? 0,
      competitorBestWinStreak: competitor?.bestWinStreak ?? 0,
      competitorPlayStreak: competitor?.playStreak ?? 0,
      competitorBestPlayStreak: competitor?.bestPlayStreak ?? 0,
      competitorRating: competitor ? competitor.rating - 2 * competitor.rd : 0,
      competitorAvgRank12: competitor?.avgRank12 ?? 0,
      isPingpongPlayer: !!pingpongPlayer,
      pingpongMatchCount: pingpongPlayer?.matchCount ?? 0,
      pingpongWeightedMatchCount: pingpongPlayer?.weightedMatchCount ?? 0,
      pingpongWins: pingpongPlayer?.wins ?? 0,
      pingpongLosses: pingpongPlayer?.losses ?? 0,
      pingpongSetsWon: pingpongPlayer?.setsWon ?? 0,
      pingpongCurrentStreak: pingpongPlayer?.currentStreak ?? 0,
      pingpongBestStreak: pingpongPlayer?.bestStreak ?? 0,
      // Conservative score, same convention as competitorRating: a high rating
      // with a wide deviation should not unlock a rating milestone.
      pingpongRating: pingpongPlayer
        ? pingpongPlayer.rating - 2 * pingpongPlayer.rd
        : 0,
      pingpongDistinctOpponents: pingpongPlayer?.distinctOpponents21d ?? 0,
      pingpongDiversityScore: pingpongPlayer?.diversityScore21d ?? 0,
      ...highlights,
    };
  }

  /**
   * Get user's unlocked achievements
   *
   * @param userId - User ID
   * @returns List of unlocked achievements
   */
  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    return await this.userAchievementRepository.find({
      where: { userId },
      relations: ['achievement'],
      order: { unlockedAt: 'DESC' },
    });
  }

  /**
   * Get achievement progress for a user
   *
   * @param userId - User ID
   * @param achievementId - Achievement ID
   * @returns Progress percentage (0-100)
   */
  async getAchievementProgress(
    userId: string,
    achievementId: string,
  ): Promise<number> {
    const achievement = await this.achievementRepository.findOne({
      where: { id: achievementId },
    });

    if (!achievement) {
      return 0;
    }

    // Check if already unlocked
    const unlocked = await this.userAchievementRepository.findOne({
      where: { userId, achievementId },
    });

    if (unlocked) {
      return 100;
    }

    // Get user stats and calculate progress
    const userStats = await this.getUserStats(userId);
    const actualValue = this.getMetricValue(
      userStats,
      achievement.condition.metric,
      achievement.condition.scope,
    );
    const targetValue = achievement.condition.value;

    return Math.min(100, Math.max(0, (actualValue / targetValue) * 100));
  }
}
