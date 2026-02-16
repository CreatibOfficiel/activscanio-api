import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStreak } from '../entities/user-streak.entity';
import { Bet } from '../../betting/entities/bet.entity';
import {
  BettingWeek,
  BettingWeekStatus,
} from '../../betting/entities/betting-week.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { User } from '../../users/user.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationCategory } from '../../notifications/dto/send-notification.dto';
import { businessDaysBetween } from '../../competitors/utils/business-days';

export interface StreakWarningStatus {
  bettingStreak: {
    atRisk: boolean;
    currentStreak: number;
    weekClosesAt: string | null;
  };
  playStreak: {
    atRisk: boolean;
    currentStreak: number;
    missedBusinessDays: number;
  };
}

@Injectable()
export class StreakWarningService {
  private readonly logger = new Logger(StreakWarningService.name);

  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Check betting streak warnings and send notifications.
   * @param urgency - 'early' or 'urgent' (Monday 18:00 UTC)
   * @returns number of users warned
   */
  async checkBettingStreakWarnings(
    urgency: 'early' | 'urgent',
  ): Promise<number> {
    // 1. Find the current OPEN betting week
    const currentWeek = await this.bettingWeekRepository.findOne({
      where: { status: BettingWeekStatus.OPEN },
      order: { createdAt: 'DESC' },
    });

    if (!currentWeek) {
      this.logger.log('No open betting week found — skipping streak warnings');
      return 0;
    }

    // 2. Find all users with an active streak
    const streaksAtRisk = await this.userStreakRepository
      .createQueryBuilder('streak')
      .where(
        'streak."currentMonthlyStreak" > 0 OR streak."currentLifetimeStreak" > 0',
      )
      .getMany();

    let warnedCount = 0;

    for (const streak of streaksAtRisk) {
      // 3. Check if user already bet this week
      const existingBet = await this.betRepository.findOne({
        where: {
          userId: streak.userId,
          bettingWeekId: currentWeek.id,
        },
      });

      if (existingBet) continue; // Already bet, no warning needed

      // 4. Check dedup: already warned this week?
      if (
        urgency === 'early' &&
        streak.lastBettingWarningWeek === currentWeek.weekNumber &&
        streak.lastBettingWarningYear === currentWeek.year
      ) {
        continue;
      }

      // 5. Build and send notification
      const currentStreak = Math.max(
        streak.currentMonthlyStreak,
        streak.currentLifetimeStreak,
      );
      const { title, body } = this.getBettingWarningMessage(
        currentStreak,
        urgency,
      );

      await this.notificationsService.sendNotification({
        userIds: [streak.userId],
        title,
        body,
        category: NotificationCategory.BETTING,
        tag: `streak-bet-W${currentWeek.weekNumber}-${currentWeek.year}-${urgency}`,
        url: '/betting',
      });

      // 6. Update dedup tracking
      await this.userStreakRepository.update(streak.id, {
        lastBettingWarningWeek: currentWeek.weekNumber,
        lastBettingWarningYear: currentWeek.year,
      });

      warnedCount++;
    }

    this.logger.log(
      `Betting streak warnings (${urgency}): ${warnedCount} users warned`,
    );
    return warnedCount;
  }

  /**
   * Check play streak warnings and send notifications.
   * @returns number of users warned
   */
  async checkPlayStreakWarnings(): Promise<number> {
    // 1. Find competitors with an active play streak
    const competitorsAtRisk = await this.competitorRepository.find({
      where: {},
    });

    // Filter in memory: playStreak > 0 and lastRaceDate exists
    const atRisk = competitorsAtRisk.filter(
      (c) => c.playStreak > 0 && c.lastRaceDate,
    );

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    let warnedCount = 0;

    for (const competitor of atRisk) {
      const missed = businessDaysBetween(competitor.lastRaceDate!, today);

      // Grace rule: 1 missed day is tolerated. Only warn at exactly 2
      // (last chance before streak resets at 3+).
      if (missed !== 2) continue;

      // Find the user linked to this competitor
      const user = await this.userRepository.findOne({
        where: { competitorId: competitor.id },
      });

      if (!user) continue;

      // Dedup: already warned today?
      if (competitor.lastPlayStreakWarningDate === todayStr) continue;

      const { title, body } = this.getPlayWarningMessage(
        competitor.playStreak,
      );

      await this.notificationsService.sendNotification({
        userIds: [user.id],
        title,
        body,
        category: NotificationCategory.RACES,
        tag: `streak-play-${todayStr}`,
        url: '/',
      });

      await this.competitorRepository.update(competitor.id, {
        lastPlayStreakWarningDate: todayStr,
      });

      warnedCount++;
    }

    this.logger.log(`Play streak warnings: ${warnedCount} users warned`);
    return warnedCount;
  }

  /**
   * Get the streak warning status for a user (for frontend display).
   */
  async getStreakWarningStatus(userId: string): Promise<StreakWarningStatus> {
    const result: StreakWarningStatus = {
      bettingStreak: { atRisk: false, currentStreak: 0, weekClosesAt: null },
      playStreak: { atRisk: false, currentStreak: 0, missedBusinessDays: 0 },
    };

    // --- Betting streak ---
    const streak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    if (streak) {
      const currentStreak = Math.max(
        streak.currentMonthlyStreak,
        streak.currentLifetimeStreak,
      );

      if (currentStreak > 0) {
        // Check if there's an OPEN week and user hasn't bet yet
        const currentWeek = await this.bettingWeekRepository.findOne({
          where: { status: BettingWeekStatus.OPEN },
          order: { createdAt: 'DESC' },
        });

        if (currentWeek) {
          const existingBet = await this.betRepository.findOne({
            where: { userId, bettingWeekId: currentWeek.id },
          });

          if (!existingBet) {
            result.bettingStreak = {
              atRisk: true,
              currentStreak,
              weekClosesAt: currentWeek.endDate
                ? currentWeek.endDate.toISOString()
                : null,
            };
          }
        }
      }
    }

    // --- Play streak ---
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (user?.competitorId) {
      const competitor = await this.competitorRepository.findOne({
        where: { id: user.competitorId },
      });

      if (competitor && competitor.playStreak > 0 && competitor.lastRaceDate) {
        const today = new Date();
        const missed = businessDaysBetween(competitor.lastRaceDate, today);

        // Grace rule: 1 missed business day is tolerated.
        // Only warn when missed >= 2 (last chance before streak resets at 3).
        if (missed >= 2) {
          result.playStreak = {
            atRisk: true,
            currentStreak: competitor.playStreak,
            missedBusinessDays: missed,
          };
        }
      }
    }

    return result;
  }

  // --- Private message helpers ---

  private getBettingWarningMessage(
    streak: number,
    urgency: 'early' | 'urgent',
  ): { title: string; body: string } {
    if (urgency === 'urgent') {
      return {
        title: 'DERNIER JOUR pour parier !',
        body: `Ta serie de ${streak} semaine(s) se termine ce soir. Parie maintenant !`,
      };
    }

    // Early (Monday)
    if (streak === 1) {
      return {
        title: 'Ta serie est en jeu !',
        body: 'Tu as parie 1 semaine d\'affilee. Place ton prono avant ce soir !',
      };
    }
    if (streak <= 4) {
      return {
        title: `${streak} semaines de suite !`,
        body: 'Belle serie ! N\'oublie pas de parier cette semaine.',
      };
    }
    if (streak <= 9) {
      const nextMilestone = streak < 5 ? 5 : 10;
      return {
        title: `Serie de ${streak} semaines`,
        body: `Tu es a ${nextMilestone - streak} semaine(s) du prochain palier. Continue !`,
      };
    }
    // 10+
    return {
      title: `Serie LEGENDAIRE : ${streak} sem.`,
      body: 'Ne laisse pas cette serie historique s\'arreter !',
    };
  }

  private getPlayWarningMessage(
    streak: number,
  ): { title: string; body: string } {
    if (streak <= 3) {
      return {
        title: `Serie de ${streak}j en danger !`,
        body: 'Dernier jour pour la sauver. Fais une course !',
      };
    }
    if (streak <= 9) {
      return {
        title: `Serie de ${streak} jours en danger !`,
        body: 'Dernier jour avant la perte. Une course et c\'est sauve !',
      };
    }
    // 10+
    return {
      title: `${streak} jours de serie en peril !`,
      body: `Ne perds pas ${streak} jours d'effort ! Joue aujourd'hui.`,
    };
  }
}
