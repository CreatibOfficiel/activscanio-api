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
import { BettorRanking } from '../../betting/entities/bettor-ranking.entity';
import { Bet } from '../../betting/entities/bet.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { RaceCreatedEvent } from '../../races/events/race-created.event';
import { XPLevelService, XPSource } from './xp-level.service';
import {
  BetFinalizedContext,
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
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    private readonly xpLevelService: XPLevelService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Listen to bet.finalized events and check for achievements
   */
  @OnEvent('bet.finalized')
  async handleBetFinalized(context: BetFinalizedContext): Promise<void> {
    this.logger.log(
      `Checking achievements for user ${context.userId} after bet finalized`,
    );

    try {
      const unlockedAchievements = await this.checkAchievements(
        context.userId,
        context,
      );

      if (unlockedAchievements.length > 0) {
        this.logger.log(
          `User ${context.userId} unlocked ${unlockedAchievements.length} achievement(s): ${unlockedAchievements.map((a) => a.achievementKey).join(', ')}`,
        );

        // Emit events for each unlocked achievement
        for (const achievement of unlockedAchievements) {
          this.eventEmitter.emit('achievement.unlocked', {
            userId: context.userId,
            achievement,
            unlockedAt: achievement.unlockedAt,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to check achievements for user ${context.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Listen to race.created events and check racing achievements for competitors
   */
  @OnEvent('race.created')
  async handleRaceCreated(event: RaceCreatedEvent): Promise<void> {
    const race = event.race;
    if (!race.results || race.results.length === 0) return;

    const competitorIds = [
      ...new Set(race.results.map((r) => r.competitorId)),
    ];

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
   * @param context - Bet finalized context (optional, for optimization)
   * @returns List of newly unlocked achievements
   */

  async checkAchievements(
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context?: BetFinalizedContext,
  ): Promise<AchievementUnlockResult[]> {
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

    switch (metric) {
      // Betting counts
      case 'betsPlaced':
        return isMonthly
          ? userStats.monthlyBetsPlaced
          : userStats.totalBetsPlaced;
      case 'betsWon':
        return isMonthly ? userStats.monthlyBetsWon : userStats.totalBetsWon;
      case 'perfectBets':
        return isMonthly
          ? userStats.monthlyPerfectBets
          : userStats.totalPerfectBets;
      case 'totalPoints':
        return isMonthly ? userStats.monthlyPoints : userStats.totalPoints;

      // Win rate
      case 'winRate':
        return userStats.winRate;

      // Partial wins
      case 'partialWins':
        return userStats.partialWins;

      // Boosts
      case 'boostsUsed':
        return userStats.totalBoostsUsed;
      case 'consecutiveBoostMonths':
        return userStats.consecutiveBoostMonths;

      // High odds
      case 'highOddsWins':
        return userStats.highOddsWins;
      case 'boostedHighOddsWins':
        return userStats.boostedHighOddsWins;

      // Streaks
      case 'monthlyStreak':
        return userStats.currentMonthlyStreak;
      case 'lifetimeStreak':
        return userStats.longestLifetimeStreak;
      case 'consecutiveWins':
        return userStats.currentWinStreak;

      // Ranking
      case 'rank':
        return isMonthly
          ? userStats.monthlyRank || 999
          : userStats.bestMonthlyRank || 999;
      case 'consecutiveMonthlyWins':
        return userStats.consecutiveMonthlyWins;

      // Special
      case 'comebackBets':
        return userStats.comebackBets;

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
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get all user bets
    const allBets = await this.betRepository.find({
      where: { userId },
      relations: ['picks'],
    });

    // Get current month ranking
    const currentMonthRanking = await this.bettorRankingRepository.findOne({
      where: { userId, month: currentMonth, year: currentYear },
    });

    // Get all historical rankings for best rank
    const allRankings = await this.bettorRankingRepository.find({
      where: { userId },
      order: { rank: 'ASC' },
    });

    // Get user streak
    const userStreak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    // Calculate stats
    const totalBetsPlaced = allBets.length;
    const totalBetsWon = allBets.filter(
      (bet) => bet.isFinalized && bet.pointsEarned > 0,
    ).length;
    const totalPerfectBets = allBets.filter(
      (bet) => bet.isFinalized && bet.picks.every((pick) => pick.isCorrect),
    ).length;
    const totalPoints = allBets.reduce(
      (sum, bet) => sum + (bet.pointsEarned || 0),
      0,
    );

    const winRate =
      totalBetsPlaced > 0 ? (totalBetsWon / totalBetsPlaced) * 100 : 0;

    // Partial wins (2/3 correct)
    const partialWins = allBets.filter((bet) => {
      if (!bet.isFinalized) return false;
      const correctCount = bet.picks.filter((pick) => pick.isCorrect).length;
      return correctCount === 2 && bet.picks.length === 3;
    }).length;

    // Boost stats
    const totalBoostsUsed = allBets.filter((bet) =>
      bet.picks.some((pick) => pick.hasBoost),
    ).length;

    // High odds wins
    const highOddsWins = allBets.filter((bet) => {
      if (!bet.isFinalized || bet.pointsEarned <= 0) return false;
      return bet.picks.some((pick) => pick.isCorrect && pick.oddAtBet > 10);
    }).length;

    const boostedHighOddsWins = allBets.filter((bet) => {
      if (!bet.isFinalized || bet.pointsEarned <= 0) return false;
      return bet.picks.some(
        (pick) => pick.isCorrect && pick.hasBoost && pick.oddAtBet > 10,
      );
    }).length;

    // Calculate consecutive boost months
    const boostsByMonth = new Map<string, boolean>();
    allBets.forEach((bet) => {
      const hasBoost = bet.picks.some((pick) => pick.hasBoost);
      if (hasBoost) {
        const betDate = new Date(bet.createdAt);
        const monthKey = `${betDate.getFullYear()}-${betDate.getMonth() + 1}`;
        boostsByMonth.set(monthKey, true);
      }
    });

    // Count consecutive months with boosts (from current month backwards)
    let consecutiveBoostMonths = 0;
    let checkYear = currentYear;
    let checkMonth = currentMonth;
    while (true) {
      const monthKey = `${checkYear}-${checkMonth}`;
      if (boostsByMonth.has(monthKey)) {
        consecutiveBoostMonths++;
        // Go to previous month
        checkMonth--;
        if (checkMonth === 0) {
          checkMonth = 12;
          checkYear--;
        }
      } else {
        break;
      }
      // Safety: don't go back more than 24 months
      if (consecutiveBoostMonths >= 24) break;
    }

    // Calculate comeback bets (winning after 3+ consecutive losses)
    const sortedBets = [...allBets].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let comebackBets = 0;
    let consecutiveLosses = 0;

    for (const bet of sortedBets) {
      if (!bet.isFinalized) continue;

      const isWin = bet.pointsEarned > 0;

      if (isWin) {
        // If we had 3+ consecutive losses, this is a comeback
        if (consecutiveLosses >= 3) {
          comebackBets++;
        }
        consecutiveLosses = 0;
      } else {
        consecutiveLosses++;
      }
    }

    // Monthly stats
    const monthlyBets = allBets.filter((bet) => {
      const betDate = new Date(bet.createdAt);
      return (
        betDate.getMonth() + 1 === currentMonth &&
        betDate.getFullYear() === currentYear
      );
    });

    const monthlyBetsPlaced = monthlyBets.length;
    const monthlyBetsWon = monthlyBets.filter(
      (bet) => bet.isFinalized && bet.pointsEarned > 0,
    ).length;
    const monthlyPerfectBets = monthlyBets.filter(
      (bet) => bet.isFinalized && bet.picks.every((pick) => pick.isCorrect),
    ).length;
    const monthlyPoints = monthlyBets.reduce(
      (sum, bet) => sum + (bet.pointsEarned || 0),
      0,
    );

    // Best rank
    const bestMonthlyRank =
      allRankings.length > 0 && allRankings[0].rank !== null
        ? allRankings[0].rank
        : null;

    // Consecutive monthly wins (rank 1)
    let consecutiveMonthlyWins = 0;
    const sortedRankings = allRankings.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    for (const ranking of sortedRankings) {
      if (ranking.rank === 1) {
        consecutiveMonthlyWins++;
      } else {
        break;
      }
    }

    // Load competitor stats if user is a competitor
    const user = await this.userRepository.findOne({ where: { id: userId } });
    let isCompetitor = false;
    let competitor: Competitor | null = null;

    if (user?.competitorId) {
      competitor = await this.competitorRepository.findOne({
        where: { id: user.competitorId },
      });
      isCompetitor = !!competitor;
    }

    return {
      userId,
      totalBetsPlaced,
      totalBetsWon,
      totalPerfectBets,
      totalPoints,
      winRate,
      partialWins,
      totalBoostsUsed,
      consecutiveBoostMonths,
      highOddsWins,
      boostedHighOddsWins,
      currentMonthlyStreak: userStreak?.currentMonthlyStreak || 0,
      longestLifetimeStreak: userStreak?.longestLifetimeStreak || 0,
      currentLifetimeStreak: userStreak?.currentLifetimeStreak || 0,
      currentWinStreak: userStreak?.currentWinStreak || 0,
      bestWinStreak: userStreak?.bestWinStreak || 0,
      monthlyBetsPlaced,
      monthlyBetsWon,
      monthlyPerfectBets,
      monthlyPoints,
      monthlyRank: currentMonthRanking?.rank || null,
      bestMonthlyRank,
      consecutiveMonthlyWins,
      comebackBets,
      isCompetitor,
      competitorTotalWins: competitor?.totalWins ?? 0,
      competitorRaceCount: competitor?.raceCount ?? 0,
      competitorWinStreak: competitor?.winStreak ?? 0,
      competitorBestWinStreak: competitor?.bestWinStreak ?? 0,
      competitorPlayStreak: competitor?.playStreak ?? 0,
      competitorBestPlayStreak: competitor?.bestPlayStreak ?? 0,
      competitorRating: competitor ? (competitor.rating - 2 * competitor.rd) : 0,
      competitorAvgRank12: competitor?.avgRank12 ?? 0,
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
