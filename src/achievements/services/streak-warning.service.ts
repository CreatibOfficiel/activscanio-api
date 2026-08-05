import { Injectable, Logger } from '@nestjs/common';
import { WeekUtils } from '../../common/utils/week-utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStreak } from '../entities/user-streak.entity';
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
  async checkParticipationStreakWarnings(
    urgency: 'early' | 'urgent',
  ): Promise<number> {
    // The current ISO week, derived from the calendar rather than from an
    // open betting week row.
    const now = new Date();
    const currentWeekNumber = WeekUtils.getISOWeek(now);
    const currentYear = now.getFullYear();

    const streaksAtRisk = await this.userStreakRepository
      .createQueryBuilder('streak')
      .where(
        'streak."currentMonthlyStreak" > 0 OR streak."currentLifetimeStreak" > 0',
      )
      .getMany();

    let warnedCount = 0;

    for (const streak of streaksAtRisk) {
      // Already took part this week — nothing to warn about.
      if (
        streak.lastParticipationWeekNumber === currentWeekNumber &&
        streak.lastParticipationYear === currentYear
      ) {
        continue;
      }

      // Dedup: an early warning goes out once a week. Urgent ones always do.
      if (
        urgency === 'early' &&
        streak.lastParticipationWarningWeek === currentWeekNumber &&
        streak.lastParticipationWarningYear === currentYear
      ) {
        continue;
      }

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
        tag: `streak-participation-W${currentWeekNumber}-${currentYear}-${urgency}`,
        url: '/',
      });

      await this.userStreakRepository.update(streak.id, {
        lastParticipationWarningWeek: currentWeekNumber,
        lastParticipationWarningYear: currentYear,
      });

      warnedCount++;
    }

    this.logger.log(
      `Participation streak warnings (${urgency}): ${warnedCount} users warned`,
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

      const { title, body } = this.getPlayWarningMessage(competitor.playStreak);

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

    // The streak row and the user row are independent; the competitor lookup
    // below needs user.competitorId, so it stays sequential.
    const [streak, user] = await Promise.all([
      this.userStreakRepository.findOne({ where: { userId } }),
      this.userRepository.findOne({ where: { id: userId } }),
    ]);

    // --- Participation streak ---
    if (streak) {
      const currentStreak = Math.max(
        streak.currentMonthlyStreak,
        streak.currentLifetimeStreak,
      );

      if (currentStreak > 0) {
        const now = new Date();
        const currentWeekNumber = WeekUtils.getISOWeek(now);
        const currentYear = now.getFullYear();

        const participatedThisWeek =
          streak.lastParticipationWeekNumber === currentWeekNumber &&
          streak.lastParticipationYear === currentYear;

        if (!participatedThisWeek) {
          result.bettingStreak = {
            atRisk: true,
            currentStreak,
            weekClosesAt: WeekUtils.getSundayOfWeek(
              currentYear,
              currentWeekNumber,
            ).toISOString(),
          };
        }
      }
    }

    // --- Play streak ---
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
        body: `Ta série de ${streak} semaine${streak > 1 ? 's' : ''} se termine ce soir. Parie maintenant !`,
      };
    }

    // Early (Monday)
    if (streak === 1) {
      return {
        title: 'Ta série est en jeu !',
        body: "Tu as parié 1 semaine d'affilée. Place ton prono avant ce soir !",
      };
    }
    if (streak <= 4) {
      return {
        title: `${streak} semaines de suite !`,
        body: "Belle série ! N'oublie pas de parier cette semaine.",
      };
    }
    if (streak <= 9) {
      const nextMilestone = streak < 5 ? 5 : 10;
      return {
        title: `Série de ${streak} semaines`,
        body: `Tu es à ${nextMilestone - streak} semaine${nextMilestone - streak > 1 ? 's' : ''} du prochain palier. Continue !`,
      };
    }
    // 10+
    return {
      title: `Série LEGENDAIRE : ${streak} sem.`,
      body: "Ne laisse pas cette série historique s'arrêter !",
    };
  }

  private getPlayWarningMessage(streak: number): {
    title: string;
    body: string;
  } {
    if (streak <= 3) {
      return {
        title: `Série de ${streak}j en danger !`,
        body: 'Dernier jour pour la sauver. Fais une course !',
      };
    }
    if (streak <= 9) {
      return {
        title: `Série de ${streak} jours en danger !`,
        body: "Dernier jour avant la perte. Une course et c'est sauvé !",
      };
    }
    // 10+
    return {
      title: `${streak} jours de série en péril !`,
      body: `Ne perds pas ${streak} jours d'effort ! Joue aujourd'hui.`,
    };
  }
}
