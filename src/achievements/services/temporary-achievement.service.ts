import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Achievement } from '../entities/achievement.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
import { BettorRanking } from '../../betting/entities/bettor-ranking.entity';
import { Bet } from '../../betting/entities/bet.entity';
import { UserStreak } from '../entities/user-streak.entity';

/**
 * TemporaryAchievementService
 *
 * Handles checking and revoking temporary achievements that can be lost.
 *
 * Temporary Achievement Types:
 * 1. Ranking-based (bronze/silver/gold medals) - Based on current month ranking
 * 2. Performance-based (in_form, olympic_form, invincible) - Based on rolling 30-day winrate
 * 3. Streak-based (active_streak, marathon) - Based on consecutive weekly participation
 */
@Injectable()
export class TemporaryAchievementService {
  private readonly logger = new Logger(TemporaryAchievementService.name);

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check all temporary achievements for a user
   *
   * @param userId - User ID
   */
  async checkTemporaryAchievements(userId: string): Promise<void> {
    this.logger.debug(`Checking temporary achievements for user ${userId}`);

    await this.checkRankingAchievements(userId);
    await this.checkPerformanceAchievements(userId);
    await this.checkStreakAchievements(userId);
  }

  /**
   * Check ranking-based achievements (bronze/silver/gold medals)
   * Awards based on current month ranking, revokes if rank changes
   *
   * @param userId - User ID
   */
  async checkRankingAchievements(userId: string): Promise<void> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get user's current ranking for this month
    const ranking = await this.bettorRankingRepository.findOne({
      where: { userId, month: currentMonth, year: currentYear },
    });

    if (!ranking) {
      // User has no ranking this month, revoke all medals
      await this.revokeAchievement(
        userId,
        'bronze_medal',
        'No ranking for current month',
      );
      await this.revokeAchievement(
        userId,
        'silver_medal',
        'No ranking for current month',
      );
      await this.revokeAchievement(
        userId,
        'gold_medal',
        'No ranking for current month',
      );
      return;
    }

    // Check gold medal (rank = 1)
    if (ranking.rank === 1) {
      await this.awardTemporaryAchievement(userId, 'gold_medal');
      await this.revokeAchievement(userId, 'silver_medal', 'Promoted to gold');
      await this.revokeAchievement(userId, 'bronze_medal', 'Promoted to gold');
    }
    // Check silver medal (rank = 2)
    else if (ranking.rank === 2) {
      await this.awardTemporaryAchievement(userId, 'silver_medal');
      await this.revokeAchievement(userId, 'gold_medal', 'Rank changed to 2');
      await this.revokeAchievement(
        userId,
        'bronze_medal',
        'Promoted to silver',
      );
    }
    // Check bronze medal (rank = 3)
    else if (ranking.rank === 3) {
      await this.awardTemporaryAchievement(userId, 'bronze_medal');
      await this.revokeAchievement(userId, 'gold_medal', 'Rank changed to 3');
      await this.revokeAchievement(userId, 'silver_medal', 'Rank changed to 3');
    }
    // Rank > 3, revoke all medals
    else {
      await this.revokeAchievement(
        userId,
        'bronze_medal',
        `Rank dropped to ${ranking.rank}`,
      );
      await this.revokeAchievement(
        userId,
        'silver_medal',
        `Rank dropped to ${ranking.rank}`,
      );
      await this.revokeAchievement(
        userId,
        'gold_medal',
        `Rank dropped to ${ranking.rank}`,
      );
    }
  }

  /**
   * Check performance-based achievements (winrate over rolling 30 days)
   *
   * Achievements:
   * - in_form: 60% winrate, min 10 bets
   * - olympic_form: 75% winrate, min 15 bets
   * - invincible: 90% winrate, min 20 bets
   *
   * @param userId - User ID
   */
  async checkPerformanceAchievements(userId: string): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all finalized bets from last 30 days
    const recentBets = await this.betRepository.find({
      where: {
        userId,
        isFinalized: true,
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
      relations: ['picks'],
    });

    if (recentBets.length === 0) {
      // No recent bets, revoke all performance achievements
      await this.revokeAchievement(
        userId,
        'in_form',
        'No bets in last 30 days',
      );
      await this.revokeAchievement(
        userId,
        'olympic_form',
        'No bets in last 30 days',
      );
      await this.revokeAchievement(
        userId,
        'invincible',
        'No bets in last 30 days',
      );
      return;
    }

    // Calculate winrate (at least one correct pick = win)
    const wins = recentBets.filter((bet) =>
      bet.picks.some((pick) => pick.isCorrect),
    ).length;
    const winRate = (wins / recentBets.length) * 100;

    this.logger.debug(
      `User ${userId} - 30-day performance: ${wins}/${recentBets.length} (${winRate.toFixed(1)}%)`,
    );

    // Check invincible (90%, min 20 bets)
    if (recentBets.length >= 20 && winRate >= 90) {
      await this.awardTemporaryAchievement(userId, 'invincible');
      await this.revokeAchievement(
        userId,
        'olympic_form',
        'Upgraded to invincible',
      );
      await this.revokeAchievement(userId, 'in_form', 'Upgraded to invincible');
    }
    // Check olympic_form (75%, min 15 bets)
    else if (recentBets.length >= 15 && winRate >= 75) {
      await this.awardTemporaryAchievement(userId, 'olympic_form');
      await this.revokeAchievement(
        userId,
        'invincible',
        `Winrate dropped to ${winRate.toFixed(1)}%`,
      );
      await this.revokeAchievement(
        userId,
        'in_form',
        'Upgraded to olympic form',
      );
    }
    // Check in_form (60%, min 10 bets)
    else if (recentBets.length >= 10 && winRate >= 60) {
      await this.awardTemporaryAchievement(userId, 'in_form');
      await this.revokeAchievement(
        userId,
        'invincible',
        `Winrate dropped to ${winRate.toFixed(1)}%`,
      );
      await this.revokeAchievement(
        userId,
        'olympic_form',
        `Winrate dropped to ${winRate.toFixed(1)}%`,
      );
    }
    // Below threshold, revoke all
    else {
      const reason =
        recentBets.length < 10
          ? `Not enough bets (${recentBets.length}/10)`
          : `Winrate too low (${winRate.toFixed(1)}%)`;
      await this.revokeAchievement(userId, 'in_form', reason);
      await this.revokeAchievement(userId, 'olympic_form', reason);
      await this.revokeAchievement(userId, 'invincible', reason);
    }
  }

  /**
   * Check streak-based achievements (consecutive weekly participation)
   *
   * Achievements:
   * - active_streak: 5 consecutive weeks
   * - marathon: 10 consecutive weeks
   *
   * @param userId - User ID
   */
  async checkStreakAchievements(userId: string): Promise<void> {
    const streak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    if (!streak) {
      // No streak record, revoke all streak achievements
      await this.revokeAchievement(
        userId,
        'active_streak',
        'No streak record found',
      );
      await this.revokeAchievement(
        userId,
        'marathon',
        'No streak record found',
      );
      return;
    }

    const currentStreak = streak.currentMonthlyStreak;

    this.logger.debug(
      `User ${userId} - Current monthly streak: ${currentStreak} weeks`,
    );

    // Check marathon (10 weeks)
    if (currentStreak >= 10) {
      await this.awardTemporaryAchievement(userId, 'marathon');
      await this.revokeAchievement(
        userId,
        'active_streak',
        'Upgraded to marathon',
      );
    }
    // Check active_streak (5 weeks)
    else if (currentStreak >= 5) {
      await this.awardTemporaryAchievement(userId, 'active_streak');
      await this.revokeAchievement(
        userId,
        'marathon',
        `Streak dropped to ${currentStreak} weeks`,
      );
    }
    // Below threshold
    else {
      await this.revokeAchievement(
        userId,
        'active_streak',
        `Streak too low (${currentStreak}/5 weeks)`,
      );
      await this.revokeAchievement(
        userId,
        'marathon',
        `Streak too low (${currentStreak}/10 weeks)`,
      );
    }
  }

  /**
   * Award a temporary achievement to a user
   * If already owned (not revoked), do nothing
   *
   * @param userId - User ID
   * @param achievementKey - Achievement key
   */
  private async awardTemporaryAchievement(
    userId: string,
    achievementKey: string,
  ): Promise<void> {
    // Check if user already has this achievement (not revoked)
    const existing = await this.userAchievementRepository.findOne({
      where: {
        userId,
        achievement: { key: achievementKey },
        revokedAt: IsNull(),
      },
      relations: ['achievement'],
    });

    if (existing) {
      // Already has it
      return;
    }

    // Get achievement definition
    const achievement = await this.achievementRepository.findOne({
      where: { key: achievementKey },
    });

    if (!achievement) {
      this.logger.warn(`Achievement ${achievementKey} not found in database`);
      return;
    }

    // Check if user had it before (revoked)
    const revoked = await this.userAchievementRepository.findOne({
      where: {
        userId,
        achievement: { key: achievementKey },
      },
      relations: ['achievement'],
      order: { revokedAt: 'DESC' },
    });

    if (revoked && revoked.revokedAt) {
      // Re-award: clear revocation
      revoked.revokedAt = null;
      revoked.revocationReason = null;
      revoked.timesEarned += 1;
      revoked.unlockedAt = new Date();
      await this.userAchievementRepository.save(revoked);

      this.logger.log(
        `User ${userId} re-earned temporary achievement: ${achievementKey} (${revoked.timesEarned}x)`,
      );

      this.eventEmitter.emit('achievement.reawarded', {
        userId,
        achievement,
        timesEarned: revoked.timesEarned,
      });
    } else {
      // First time earning
      const userAchievement = this.userAchievementRepository.create({
        userId,
        achievement,
        unlockedAt: new Date(),
        timesEarned: 1,
      });

      await this.userAchievementRepository.save(userAchievement);

      this.logger.log(
        `User ${userId} earned temporary achievement: ${achievementKey}`,
      );

      this.eventEmitter.emit('achievement.unlocked', {
        userId,
        achievement,
      });
    }
  }

  /**
   * Revoke an achievement from a user
   * If not owned or already revoked, do nothing
   *
   * @param userId - User ID
   * @param achievementKey - Achievement key
   * @param reason - Reason for revocation
   */
  async revokeAchievement(
    userId: string,
    achievementKey: string,
    reason: string,
  ): Promise<void> {
    // Find active (not revoked) user achievement
    const userAchievement = await this.userAchievementRepository.findOne({
      where: {
        userId,
        achievement: { key: achievementKey },
        revokedAt: IsNull(),
      },
      relations: ['achievement'],
    });

    if (!userAchievement) {
      // User doesn't have this achievement or it's already revoked
      return;
    }

    // Mark as revoked
    userAchievement.revokedAt = new Date();
    userAchievement.revocationReason = reason;
    await this.userAchievementRepository.save(userAchievement);

    this.logger.log(
      `Revoked achievement ${achievementKey} from user ${userId}: ${reason}`,
    );

    this.eventEmitter.emit('achievement.revoked', {
      userId,
      achievement: userAchievement.achievement,
      reason,
    });
  }

  /**
   * Check all users for temporary achievements
   * Used by cron jobs
   */
  async checkAllUsersTemporaryAchievements(): Promise<void> {
    this.logger.log('Checking temporary achievements for all users...');

    // Get all users who have at least one bet
    const userIds = await this.betRepository
      .createQueryBuilder('bet')
      .select('DISTINCT bet.userId')
      .getRawMany();

    let processedCount = 0;
    let errorCount = 0;

    for (const { bet_userId } of userIds) {
      try {
        await this.checkTemporaryAchievements(bet_userId);
        processedCount++;
      } catch (error) {
        this.logger.error(
          `Error checking temporary achievements for user ${bet_userId}: ${error.message}`,
        );
        errorCount++;
      }
    }

    this.logger.log(
      `Temporary achievements check complete: ${processedCount} users processed, ${errorCount} errors`,
    );
  }
}
