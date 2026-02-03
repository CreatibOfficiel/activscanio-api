/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { BettingWeek, BettingWeekStatus } from './entities/betting-week.entity';
import { Bet } from './entities/bet.entity';
import { BetPick, BetPosition } from './entities/bet-pick.entity';
import { CreateBettingWeekDto } from './dto/create-betting-week.dto';
import { PlaceBetDto } from './dto/place-bet.dto';
import { CompetitorOdds } from './entities/competitor-odds.entity';
import { User } from '../users/user.entity';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { Achievement } from '../achievements/entities/achievement.entity';
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
  ) {}

  /**
   * Get current week (status = open)
   */
  async getCurrentWeek(): Promise<BettingWeek | null> {
    const now = new Date();

    return await this.bettingWeekRepository.findOne({
      where: {
        status: BettingWeekStatus.OPEN,
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
      relations: ['podiumFirst', 'podiumSecond', 'podiumThird'],
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

    await this.betRepository.save(bet);

    // Create bet picks
    const positions: BetPosition[] = [
      BetPosition.FIRST,
      BetPosition.SECOND,
      BetPosition.THIRD,
    ];

    const picks = placeBetDto.picks.map((pickDto, index) => {
      const odd = oddsArray[index]!; // Already checked that odd exists above
      const position = positions[index];

      // Use position-specific odds when available, fallback to legacy 'odd' field
      let oddAtBet: number;
      if (position === BetPosition.FIRST && odd.oddFirst) {
        oddAtBet = odd.oddFirst;
      } else if (position === BetPosition.SECOND && odd.oddSecond) {
        oddAtBet = odd.oddSecond;
      } else if (position === BetPosition.THIRD && odd.oddThird) {
        oddAtBet = odd.oddThird;
      } else {
        oddAtBet = odd.odd; // Fallback to legacy field
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

    // Update boost usage if boost was applied
    if (boostCount === 1) {
      await this.userRepository.update(userId, {
        lastBoostUsedMonth: new Date().getMonth() + 1,
        lastBoostUsedYear: new Date().getFullYear(),
      });
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

    // For each finalized bet, fetch achievements unlocked around the betting week's finalization time
    const betsWithAchievements = await Promise.all(
      bets.map(async (bet) => {
        if (!bet.isFinalized || !bet.bettingWeek.finalizedAt) {
          return { ...bet, achievementsUnlocked: [] };
        }

        // Query achievements unlocked within 1 hour after the betting week was finalized
        const finalizedAt = bet.bettingWeek.finalizedAt;
        const timeWindowEnd = new Date(finalizedAt.getTime() + 60 * 60 * 1000); // +1 hour

        const achievements = await this.userAchievementRepository.find({
          where: {
            userId,
            unlockedAt: Between(finalizedAt, timeWindowEnd),
          },
          relations: ['achievement'],
          order: { unlockedAt: 'ASC' },
        });

        // Map to the expected format
        const achievementsUnlocked = achievements.map((ua) => ({
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
      }),
    );

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
}
