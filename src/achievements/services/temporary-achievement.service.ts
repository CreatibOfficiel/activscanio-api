import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Achievement } from '../entities/achievement.entity';
import { UserAchievement } from '../entities/user-achievement.entity';
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

    await this.checkStreakAchievements(userId);
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

    // Every user carrying a participation streak
    const streaks = await this.userStreakRepository.find({
      select: { userId: true },
    });
    const userIds = streaks.map((s) => ({ bet_userId: s.userId }));

    let processedCount = 0;
    let errorCount = 0;

    for (const row of userIds) {
      const bet_userId = row.bet_userId;
      try {
        await this.checkTemporaryAchievements(bet_userId);
        processedCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Error checking temporary achievements for user ${bet_userId}: ${errorMessage}`,
        );
        errorCount++;
      }
    }

    this.logger.log(
      `Temporary achievements check complete: ${processedCount} users processed, ${errorCount} errors`,
    );
  }
}
