/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  IsNull,
  FindOptionsWhere,
} from 'typeorm';
import { BettingWeek, BettingWeekStatus } from './entities/betting-week.entity';
import { Bet, BetStatus } from './entities/bet.entity';
import { BetPick, BetPosition } from './entities/bet-pick.entity';
import { CreateBettingWeekDto } from './dto/create-betting-week.dto';
import { PlaceBetDto } from './dto/place-bet.dto';
import { CompetitorOdds } from './entities/competitor-odds.entity';
import { User } from '../users/user.entity';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { Achievement } from '../achievements/entities/achievement.entity';
import { UserStreak } from '../achievements/entities/user-streak.entity';
import { Competitor } from '../competitors/competitor.entity';
import { PaginatedResponse } from '../common';

@Injectable()
export class BettingService {
  constructor(
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BetPick)
    private readonly betPickRepository: Repository<BetPick>,
    @InjectRepository(CompetitorOdds)
    private readonly competitorOddsRepository: Repository<CompetitorOdds>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
  ) {}

  /**
   * Get current week (status = open or closed)
   */
  async getCurrentWeek(): Promise<BettingWeek | null> {
    const now = new Date();

    return await this.bettingWeekRepository.findOne({
      where: [
        { status: BettingWeekStatus.OPEN, startDate: LessThanOrEqual(now), endDate: MoreThanOrEqual(now) },
        { status: BettingWeekStatus.CLOSED, startDate: LessThanOrEqual(now), endDate: MoreThanOrEqual(now) },
      ],
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
      order: { startDate: 'DESC' },
    });
  }

  /**
   * Create a new betting week
   */
  async createWeek(createWeekDto: CreateBettingWeekDto): Promise<BettingWeek> {
    // Check if week already exists
    const existing = await this.bettingWeekRepository.findOne({
      where: {
        year: createWeekDto.year,
        weekNumber: createWeekDto.weekNumber,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Betting week ${createWeekDto.year}-W${createWeekDto.weekNumber} already exists`,
      );
    }

    const week = this.bettingWeekRepository.create(createWeekDto);
    return await this.bettingWeekRepository.save(week);
  }

  /**
   * Get all weeks (optionally filter by month/year)
   */
  async getWeeks(month?: number, year?: number): Promise<BettingWeek[]> {
    const where: any = {};

    if (month) where.month = month;

    if (year) where.year = year;

    return await this.bettingWeekRepository.find({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where,
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
      order: { year: 'DESC', weekNumber: 'DESC' },
    });
  }

  /**
   * Get week by ID
   */
  async getWeekById(weekId: string): Promise<BettingWeek> {
    const week = await this.bettingWeekRepository.findOne({
      where: { id: weekId },
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
    });

    if (!week) {
      throw new NotFoundException(`Betting week with ID ${weekId} not found`);
    }

    return week;
  }

  /**
   * Get current odds for a week
   */
  async getCurrentOdds(weekId: string): Promise<CompetitorOdds[]> {
    await this.getWeekById(weekId);

    // Get latest odds for each competitor in this week
    const odds = await this.competitorOddsRepository
      .createQueryBuilder('odds')
      .where('odds.bettingWeekId = :weekId', { weekId })
      .distinctOn(['odds.competitorId'])
      .orderBy('odds.competitorId')
      .addOrderBy('odds.calculatedAt', 'DESC')
      .leftJoinAndSelect('odds.competitor', 'competitor')
      .getMany();

    return odds;
  }

  /**
   * Place a bet
   */
  async placeBet(userId: string, placeBetDto: PlaceBetDto): Promise<Bet> {
    const week = await this.getWeekById(placeBetDto.bettingWeekId);

    // Check if week is open
    if (week.status !== BettingWeekStatus.OPEN) {
      throw new BadRequestException('This betting week is closed');
    }

    // Check if user already placed a bet this week
    const existingBet = await this.betRepository.findOne({
      where: {
        userId,
        bettingWeekId: placeBetDto.bettingWeekId,
      },
    });

    if (existingBet) {
      throw new ConflictException('You already placed a bet for this week');
    }

    // Validate picks
    if (placeBetDto.picks.length !== 3) {
      throw new BadRequestException('You must select exactly 3 competitors');
    }

    // Check for duplicate competitors
    const competitorIds = placeBetDto.picks.map((p) => p.competitorId);
    const uniqueIds = new Set(competitorIds);
    if (uniqueIds.size !== 3) {
      throw new BadRequestException(
        'You cannot select the same competitor twice',
      );
    }

    // Check boost - only one competitor can have boost
    const boostCount = placeBetDto.picks.filter((p) => p.hasBoost).length;
    if (boostCount > 1) {
      throw new BadRequestException('You can only boost one competitor');
    }

    // Check monthly boost limit
    if (boostCount === 1) {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11, we need 1-12
      const currentYear = new Date().getFullYear();

      if (
        user.lastBoostUsedMonth === currentMonth &&
        user.lastBoostUsedYear === currentYear
      ) {
        throw new BadRequestException(
          'You have already used your monthly boost. Boost resets at the start of each month.',
        );
      }
    }

    // Get current odds for each competitor
    const oddsPromises = competitorIds.map((competitorId) =>
      this.competitorOddsRepository
        .createQueryBuilder('odds')
        .where('odds.competitorId = :competitorId', { competitorId })
        .andWhere('odds.bettingWeekId = :weekId', {
          weekId: placeBetDto.bettingWeekId,
        })
        .orderBy('odds.calculatedAt', 'DESC')
        .getOne(),
    );

    const oddsArray = await Promise.all(oddsPromises);

    // Check if all competitors have odds
    if (oddsArray.some((odd) => !odd)) {
      throw new BadRequestException(
        'Some competitors do not have odds for this week',
      );
    }

    // Create bet
    const bet = this.betRepository.create({
      userId,
      bettingWeekId: placeBetDto.bettingWeekId,
      placedAt: new Date(),
    });

    try {
      await this.betRepository.save(bet);
    } catch (error: any) {
      // Handle unique constraint violation (concurrent duplicate bet)
      if (error.code === '23505') {
        throw new ConflictException('You already placed a bet for this week');
      }
      throw error;
    }

    // Create bet picks
    const positions: BetPosition[] = [
      BetPosition.FIRST,
      BetPosition.SECOND,
      BetPosition.THIRD,
    ];

    const picks = placeBetDto.picks.map((pickDto, index) => {
      const odd = oddsArray[index]!; // Already checked that odd exists above
      const position = positions[index];

      let oddAtBet: number;
      if (position === BetPosition.FIRST) {
        oddAtBet = odd.oddFirst;
      } else if (position === BetPosition.SECOND) {
        oddAtBet = odd.oddSecond;
      } else {
        oddAtBet = odd.oddThird;
      }

      return this.betPickRepository.create({
        betId: bet.id,
        competitorId: pickDto.competitorId,
        position,
        oddAtBet,
        hasBoost: pickDto.hasBoost || false,
      });
    });

    await this.betPickRepository.save(picks);

    // Atomically consume the boost to prevent race conditions (M2)
    if (boostCount === 1) {
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const result = await this.userRepository
        .createQueryBuilder()
        .update()
        .set({
          lastBoostUsedMonth: currentMonth,
          lastBoostUsedYear: currentYear,
        })
        .where('id = :userId', { userId })
        .andWhere(
          '("lastBoostUsedMonth" IS NULL OR "lastBoostUsedMonth" != :month OR "lastBoostUsedYear" != :year)',
          { month: currentMonth, year: currentYear },
        )
        .execute();

      if (result.affected === 0) {
        throw new BadRequestException(
          'You have already used your monthly boost. Boost resets at the start of each month.',
        );
      }
    }

    // Reload bet with picks
    const reloadedBet = await this.betRepository.findOne({
      where: { id: bet.id },
      relations: ['picks', 'picks.competitor', 'bettingWeek'],
    });

    return reloadedBet!; // Bet was just created, must exist
  }

  /**
   * Get user's bet for a specific week
   */
  async getUserBet(userId: string, weekId: string): Promise<Bet | null> {
    return await this.betRepository.findOne({
      where: {
        userId,
        bettingWeekId: weekId,
      },
      relations: ['picks', 'picks.competitor', 'bettingWeek'],
    });
  }

  /**
   * Get all user's bets with pagination
   */
  async getUserBets(
    userId: string,
    limit = 10,
    offset = 0,
  ): Promise<PaginatedResponse<Bet>> {
    const [bets, total] = await this.betRepository.findAndCount({
      where: { userId },
      relations: ['picks', 'picks.competitor', 'bettingWeek'],
      order: { placedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Batch-load achievements for all finalized bets in a single query
    const finalizedBets = bets.filter(
      (b) => b.isFinalized && b.bettingWeek?.finalizedAt,
    );

    // Compute the overall time range across all finalized bets
    let allAchievements: UserAchievement[] = [];
    if (finalizedBets.length > 0) {
      const earliest = new Date(
        Math.min(
          ...finalizedBets.map((b) => b.bettingWeek.finalizedAt.getTime()),
        ),
      );
      const latest = new Date(
        Math.max(
          ...finalizedBets.map(
            (b) => b.bettingWeek.finalizedAt.getTime() + 60 * 60 * 1000,
          ),
        ),
      );

      allAchievements = await this.userAchievementRepository.find({
        where: {
          userId,
          unlockedAt: Between(earliest, latest),
        },
        relations: ['achievement'],
        order: { unlockedAt: 'ASC' },
      });
    }

    // Map achievements to the corresponding bet based on finalizedAt window
    const betsWithAchievements = bets.map((bet) => {
      if (!bet.isFinalized || !bet.bettingWeek?.finalizedAt) {
        return { ...bet, achievementsUnlocked: [] };
      }

      const finalizedAt = bet.bettingWeek.finalizedAt;
      const timeWindowEnd = new Date(finalizedAt.getTime() + 60 * 60 * 1000);

      const achievementsUnlocked = allAchievements
        .filter(
          (ua) => ua.unlockedAt >= finalizedAt && ua.unlockedAt <= timeWindowEnd,
        )
        .map((ua) => ({
          id: ua.achievement.id,
          key: ua.achievement.key,
          name: ua.achievement.name,
          description: ua.achievement.description,
          category: ua.achievement.category,
          rarity: ua.achievement.rarity,
          icon: ua.achievement.icon,
          xpReward: ua.achievement.xpReward,
          unlocksTitle: ua.achievement.unlocksTitle,
          unlockedAt: ua.unlockedAt,
        }));

      return { ...bet, achievementsUnlocked };
    });

    return PaginatedResponse.create(
      betsWithAchievements as Bet[],
      total,
      limit,
      offset,
    );
  }

  /**
   * Get all bets for a week
   */
  async getWeekBets(weekId: string): Promise<Bet[]> {
    return await this.betRepository.find({
      where: { bettingWeekId: weekId },
      relations: ['user', 'picks', 'picks.competitor'],
      order: { placedAt: 'ASC' },
    });
  }

  /**
   * Check if user can use boost this month
   */
  async getBoostAvailability(userId: string): Promise<{
    canUseBoost: boolean;
    lastUsed: { month: number; year: number } | null;
    resetsOn: Date;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const canUseBoost = !(
      user.lastBoostUsedMonth === currentMonth &&
      user.lastBoostUsedYear === currentYear
    );

    const lastUsed = user.lastBoostUsedMonth
      ? {
          month: user.lastBoostUsedMonth,
          year: user.lastBoostUsedYear!,
        }
      : null;

    // Calculate first day of next month
    const resetsOn = new Date(currentYear, currentMonth, 1); // Month is 0-indexed in Date constructor

    return {
      canUseBoost,
      lastUsed,
      resetsOn,
    };
  }

  /**
   * Get all community bets with pagination and optional filters
   */
  async getCommunityBets(
    limit = 10,
    offset = 0,
    userId?: string,
    status?: BetStatus,
  ): Promise<PaginatedResponse<Bet>> {
    const where: FindOptionsWhere<Bet> = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [bets, total] = await this.betRepository.findAndCount({
      where,
      relations: ['user', 'picks', 'picks.competitor', 'bettingWeek'],
      order: { placedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return PaginatedResponse.create(bets, total, limit, offset);
  }

  /**
   * Get the most recent finalized bet with unseen result for a user
   */
  async getUnseenBetResult(userId: string): Promise<Bet | null> {
    return await this.betRepository.findOne({
      where: {
        userId,
        isFinalized: true,
        resultSeenAt: IsNull(),
      },
      relations: ['picks', 'picks.competitor', 'bettingWeek'],
      order: { placedAt: 'DESC' },
    });
  }

  /**
   * Mark a bet result as seen
   */
  async markBetResultSeen(userId: string, betId: string): Promise<void> {
    await this.betRepository.update(
      { id: betId, userId },
      { resultSeenAt: new Date() },
    );
  }

  /**
   * Get unseen streak losses for a user (both betting and play)
   */
  async getUnseenStreakLosses(userId: string): Promise<{
    bettingStreakLoss: { lostValue: number; lostAt: Date } | null;
    playStreakLoss: { lostValue: number; lostAt: Date } | null;
  }> {
    // Check betting streak loss
    const userStreak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    let bettingStreakLoss: { lostValue: number; lostAt: Date } | null = null;
    if (
      userStreak?.bettingStreakLostValue &&
      userStreak.bettingStreakLostAt &&
      !userStreak.bettingStreakLossSeenAt
    ) {
      bettingStreakLoss = {
        lostValue: userStreak.bettingStreakLostValue,
        lostAt: userStreak.bettingStreakLostAt,
      };
    }

    // Check play streak loss (via competitor linked to user)
    const user = await this.userRepository.findOne({ where: { id: userId } });
    let playStreakLoss: { lostValue: number; lostAt: Date } | null = null;

    if (user?.competitorId) {
      const competitor = await this.competitorRepository.findOne({
        where: { id: user.competitorId },
      });

      if (
        competitor?.playStreakLostValue &&
        competitor.playStreakLostAt &&
        !competitor.playStreakLossSeenAt
      ) {
        playStreakLoss = {
          lostValue: competitor.playStreakLostValue,
          lostAt: competitor.playStreakLostAt,
        };
      }
    }

    return { bettingStreakLoss, playStreakLoss };
  }

  /**
   * Mark all streak losses as seen for a user
   */
  async markStreakLossesSeen(userId: string): Promise<void> {
    const now = new Date();

    // Mark betting streak loss as seen
    await this.userStreakRepository.update(
      { userId },
      { bettingStreakLossSeenAt: now },
    );

    // Mark play streak loss as seen (via competitor linked to user)
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.competitorId) {
      await this.competitorRepository.update(user.competitorId, {
        playStreakLossSeenAt: now,
      });
    }
  }
}
