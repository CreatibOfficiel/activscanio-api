import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Raw, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Competitor } from '../competitor.entity';
import { BaseRepository } from '../../common/repositories/base.repository';
import { RaceResult } from '../../races/race-result.entity';
import { User } from '../../users/user.entity';
import {
  businessDaysBetween,
  missedBusinessDays,
} from '../utils/business-days';

/**
 * Competitor repository with domain-specific queries
 *
 * Competitor State Management:
 * - markAsActiveThisWeek: Called after a race is created
 * - resetWeeklyActivity: Called by cron every Monday
 * - resetMonthlyStats: Called at each season transition (1st week of a 4-week cycle)
 */
@Injectable()
export class CompetitorRepository extends BaseRepository<Competitor> {
  private readonly eventEmitter: EventEmitter2;
  private readonly userRepository: Repository<User>;

  constructor(
    @InjectRepository(Competitor)
    repository: Repository<Competitor>,
    @InjectRepository(User)
    userRepository: Repository<User>,
    eventEmitter: EventEmitter2,
  ) {
    super(repository, 'Competitor');
    this.eventEmitter = eventEmitter;
    this.userRepository = userRepository;
  }

  /**
   * Find all competitors with their character variants loaded
   */
  async findAllWithCharacterVariants(): Promise<Competitor[]> {
    return this.repository.find({
      where: [{ leftAt: IsNull() }, { leftAt: Raw((alias) => `${alias} > CURRENT_DATE`) }],
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  async findAllIncludingAlumni(): Promise<Competitor[]> {
    return this.repository.find({
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
  }

  /**
   * Find competitors who are active this week (for betting eligibility)
   */
  async findActiveThisWeek(): Promise<Competitor[]> {
    return this.repository.find({
      where: [
        { isActiveThisWeek: true, leftAt: IsNull() },
        { isActiveThisWeek: true, leftAt: Raw((alias) => `${alias} > CURRENT_DATE`) },
      ],
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /**
   * Find competitors by array of IDs
   * @param ids - Array of competitor UUIDs
   */
  async findByIds(ids: string[]): Promise<Competitor[]> {
    return this.repository.find({
      where: { id: In(ids) },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  async findActiveByIds(ids: string[]): Promise<Competitor[]> {
    return this.repository
      .createQueryBuilder('competitor')
      .leftJoinAndSelect('competitor.characterVariant', 'variant')
      .leftJoinAndSelect('variant.baseCharacter', 'baseCharacter')
      .where('competitor.id IN (:...ids)', { ids })
      .andWhere('(competitor."leftAt" IS NULL OR competitor."leftAt" > CURRENT_DATE)')
      .getMany();
  }

  /**
   * Find a competitor with all relations loaded
   * @param id - Competitor UUID
   */
  async findOneWithRelations(id: string): Promise<Competitor | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
  }

  /**
   * Update ratings for a single competitor
   * @param competitorId - Competitor UUID
   * @param ratings - New rating, rd, and vol values
   */
  async updateRatings(
    competitorId: string,
    ratings: { rating: number; rd: number; vol: number },
  ): Promise<void> {
    await this.repository.update(competitorId, ratings);
    this.logger.log(`Updated ratings for competitor ${competitorId}`);
  }

  /**
   * Update ratings for multiple competitors after a race
   * This includes rating, rd, vol, raceCount, avgRank12, lastRaceDate, and conservativeScore
   *
   * @param competitors - Competitors to update
   * @param updatedRatings - Map of competitor ID to new ratings
   * @param raceResults - Race results for calculating averages
   */
  async updateManyRatings(
    competitors: Competitor[],
    updatedRatings: Map<string, { rating: number; rd: number; vol: number }>,
    raceResults: RaceResult[],
  ): Promise<void> {
    await this.repository.manager.transaction(async (em) => {
      for (const c of competitors) {
        const ratings = updatedRatings.get(c.id)!;
        const result = raceResults.find((r) => r.competitorId === c.id)!;

        Object.assign(c, {
          rating: ratings.rating,
          rd: ratings.rd,
          vol: ratings.vol,
          conservativeScore: ratings.rating - 2 * ratings.rd,
          raceCount: c.raceCount + 1,
          lastRaceDate: new Date(),
          // avgRank12 is a seasonal average: uses currentMonthRaceCount (already
          // incremented by markAsActiveThisWeek before updateManyRatings runs)
          avgRank12:
            c.currentMonthRaceCount > 0
              ? c.avgRank12 +
                (result.rank12 - c.avgRank12) / c.currentMonthRaceCount
              : result.rank12,
          lifetimeAvgRank:
            c.lifetimeAvgRank +
            (result.rank12 - c.lifetimeAvgRank) / (c.totalLifetimeRaces + 1),
        });
        await em.save(c);
      }
    });

    this.logger.log(`Updated ratings for ${competitors.length} competitors`);
  }

  /**
   * Mark competitor as active this week (for betting eligibility)
   * Also increments the current month race count and totalLifetimeRaces
   *
   * @param competitorId - Competitor UUID
   */
  async markAsActiveThisWeek(competitorId: string): Promise<void> {
    await this.repository.update(competitorId, {
      isActiveThisWeek: true,
      currentMonthRaceCount: () => '"currentMonthRaceCount" + 1',
      totalLifetimeRaces: () => '"totalLifetimeRaces" + 1',
    });
  }

  /**
   * Reset weekly activity flags for all competitors
   * Called by cron every Monday
   */
  async resetWeeklyActivity(): Promise<void> {
    await this.repository.update({}, { isActiveThisWeek: false });
    this.logger.log('Reset weekly activity for all competitors');
  }

  /**
   * Reset season stats at the end of a 4-week season.
   *
   * Two distinct paths, matching Glicko-2 canonical behavior:
   *
   * 1. ACTIVE competitors (currentMonthRaceCount > 0) — full soft reset:
   *    - rating = 0.75 × oldRating + 0.25 × 1500  (squish toward 1500)
   *    - rd     = min(sqrt(rd² + vol² × 173.7178²), 350)  (Glickman Step 6)
   *    - vol    = 0.06 (default)
   *    - currentMonthRaceCount = 0
   *    - winStreak = 0
   *
   * 2. INACTIVE competitors (currentMonthRaceCount = 0) — Glickman Step 6 only:
   *    - rating, vol UNCHANGED  (per Glicko-2 paper, §Step 6)
   *    - rd     = min(sqrt(rd² + vol² × 173.7178²), 350)
   *    - winStreak unchanged (no races = no streak interruption)
   *    - currentMonthRaceCount stays 0 trivially
   *
   *   Rationale: applying the 75/25 squish to absent players is a "stealth
   *   hard reset" — drift compounds to ~58% toward 1500 after 3 missed
   *   seasons. Lichess, Apex S25+, Valorant, all open-source Glicko-2 libs
   *   skip the rating reset for inactives. The RD bump alone already handles
   *   "you've been away, your rating is now uncertain": when they return,
   *   their inflated RD makes their first races swing big and re-anchor
   *   them to the active field naturally.
   *
   * NOT reset (intentional, both paths):
   * - raceCount: lifetime total, used for confirmed/provisional classification.
   *   Resetting it would make all competitors "provisional" (raceCount < 5)
   *   for ~5 weeks, preventing any podium formation.
   * - avgRank12: running lifetime average, stays consistent with raceCount.
   * - totalLifetimeRaces: all-time counter
   * - recentPositions, formFactor: based on actual race history
   *
   * Must run AFTER archiveSeasonStats (which reads currentMonthRaceCount).
   */
  async resetMonthlyStats(): Promise<void> {
    // Path 1 — active competitors: full soft reset
    const activeResult = await this.repository
      .createQueryBuilder()
      .update(Competitor)
      .set({
        rating: () => '0.75 * "rating" + 0.25 * 1500',
        rd: () =>
          'LEAST(SQRT("rd" * "rd" + "vol" * "vol" * 173.7178 * 173.7178), 350)',
        vol: 0.06,
        currentMonthRaceCount: 0,
        winStreak: 0,
      })
      .where('"currentMonthRaceCount" > 0')
      .execute();

    // Path 2 — inactive competitors: RD-only update (Glickman Step 6)
    const inactiveResult = await this.repository
      .createQueryBuilder()
      .update(Competitor)
      .set({
        rd: () =>
          'LEAST(SQRT("rd" * "rd" + "vol" * "vol" * 173.7178 * 173.7178), 350)',
      })
      .where('"currentMonthRaceCount" = 0')
      .execute();

    this.logger.log(
      `Season reset: ${activeResult.affected ?? 0} active (75/25 squish), ` +
        `${inactiveResult.affected ?? 0} inactive (RD-only update)`,
    );
  }

  /**
   * Batch update recent positions for multiple competitors after a race.
   * Prepends new position and keeps last 5.
   *
   * @param raceResults - Array of race results with competitorId and rank12
   */
  async updateRecentPositions(
    raceResults: { competitorId: string; rank12: number }[],
  ): Promise<void> {
    await this.repository.manager.transaction(async (em) => {
      for (const result of raceResults) {
        const competitor = await em.findOne(Competitor, {
          where: { id: result.competitorId },
        });

        if (!competitor) {
          continue;
        }

        const currentPositions = competitor.recentPositions ?? [];
        competitor.recentPositions = [result.rank12, ...currentPositions].slice(
          0,
          5,
        );
        await em.save(competitor);
      }
    });

    this.logger.log(
      `Updated recent positions for ${raceResults.length} competitors after race`,
    );
  }

  /**
   * Snapshot daily ranks for all confirmed competitors.
   * Called by cron daily at midnight.
   *
   * Calculates current rank based on conservativeScore (rating - 2*rd)
   * and stores it in previousDayRank for trend calculation.
   */
  async snapshotDailyRanks(): Promise<void> {
    // Get all competitors with at least one race, sorted by conservativeScore
    const competitors = await this.repository.find({
      order: {},
    });

    // Calculate conservative scores and sort (confirmed only: same criteria as sanitize-competitor.ts)
    const scoredCompetitors = competitors
      .filter((c) => c.raceCount >= 5 && c.rd <= 150)
      .map((c) => ({
        id: c.id,
        conservativeScore: c.rating - 2 * c.rd,
      }))
      .sort((a, b) => b.conservativeScore - a.conservativeScore);

    const confirmedIds = scoredCompetitors.map((c) => c.id);

    // Update previousDayRank for each confirmed competitor (with ties)
    // and clear previousDayRank for non-confirmed competitors
    await this.repository.manager.transaction(async (em) => {
      let currentRank = 1;
      for (let i = 0; i < scoredCompetitors.length; i++) {
        if (
          i > 0 &&
          scoredCompetitors[i].conservativeScore <
            scoredCompetitors[i - 1].conservativeScore
        ) {
          currentRank = i + 1;
        }
        await em.update(Competitor, scoredCompetitors[i].id, {
          previousDayRank: currentRank,
        });
      }

      // Clear previousDayRank for non-confirmed competitors so they don't
      // leave stale rank data that skews trend calculations
      const nonConfirmed = competitors.filter(
        (c) => !confirmedIds.includes(c.id),
      );
      for (const c of nonConfirmed) {
        if (c.previousDayRank !== null) {
          await em.update(Competitor, c.id, { previousDayRank: null });
        }
      }
    });

    this.logger.log(
      `Snapshotted daily ranks for ${scoredCompetitors.length} competitors (cleared ${competitors.length - confirmedIds.length} non-confirmed)`,
    );
  }

  /**
   * Update play streak for a competitor after a race.
   *
   * Rules:
   * - Only weekdays (Mon-Fri) count
   * - 1 missed weekday is tolerated (grace)
   * - 2+ missed weekdays resets the streak
   *
   * @param competitorId - Competitor UUID
   * @param raceDate - Date of the race
   */
  async updatePlayStreak(competitorId: string, raceDate: Date): Promise<void> {
    const competitor = await this.repository.findOne({
      where: { id: competitorId },
    });

    if (!competitor) return;

    let { playStreak, bestPlayStreak } = competitor;

    if (!competitor.lastRaceDate) {
      playStreak = 1;
    } else {
      const businessDays = businessDaysBetween(
        competitor.lastRaceDate,
        raceDate,
      );

      if (businessDays === 0) {
        // Same business day — no change
        return;
      } else if (businessDays <= 2) {
        // Consecutive day (1) or 1-day grace (2)
        playStreak += 1;
      } else {
        // 2+ missed weekdays — streak broken
        if (playStreak > 0) {
          // Track the lost streak for notification
          const missed = missedBusinessDays(competitor.lastRaceDate, raceDate);
          competitor.playStreakLostValue = playStreak;
          competitor.playStreakLostAt = new Date();
          competitor.playStreakLossSeenAt = null;

          await this.repository.update(competitorId, {
            playStreakLostValue: playStreak,
            playStreakLostAt: new Date(),
            playStreakLossSeenAt: null,
            playStreakMissedDays: missed.join(','),
          });

          // Find the user linked to this competitor
          const user = await this.userRepository.findOne({
            where: { competitorId },
          });

          if (user) {
            this.eventEmitter.emit('streak.play_lost', {
              userId: user.id,
              lostValue: playStreak,
              lostAt: new Date(),
              missedDays: missed,
            });
          }
        }

        playStreak = 1;
      }
    }

    bestPlayStreak = Math.max(bestPlayStreak, playStreak);

    await this.repository.update(competitorId, {
      playStreak,
      bestPlayStreak,
    });
  }

  /**
   * Update win streak for a competitor after a race.
   *
   * If rank12 === 1: increment winStreak, update bestWinStreak if new record
   * Otherwise: reset winStreak to 0
   *
   * @param competitorId - Competitor UUID
   * @param rank12 - Race finishing position
   */
  async updateWinStreak(competitorId: string, rank12: number): Promise<void> {
    const competitor = await this.repository.findOne({
      where: { id: competitorId },
    });

    if (!competitor) return;

    if (rank12 === 1) {
      competitor.winStreak += 1;
      competitor.totalWins += 1;
      competitor.bestWinStreak = Math.max(
        competitor.bestWinStreak,
        competitor.winStreak,
      );
    } else {
      competitor.winStreak = 0;
    }

    await this.repository.update(competitorId, {
      winStreak: competitor.winStreak,
      bestWinStreak: competitor.bestWinStreak,
      totalWins: competitor.totalWins,
    });
  }
}
