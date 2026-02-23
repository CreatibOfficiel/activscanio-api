import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LiveBet, LiveBetStatus } from '../entities/live-bet.entity';
import { User } from '../../users/user.entity';
import { BettorRanking } from '../../betting/entities/bettor-ranking.entity';
import { CompetitorOdds } from '../../betting/entities/competitor-odds.entity';
import { BettingWeek, BettingWeekStatus } from '../../betting/entities/betting-week.entity';
import { RaceEvent } from '../../races/race-event.entity';
import { RaceResult } from '../../races/race-result.entity';
import { CharacterDetectorService } from './character-detector.service';
import { UploadService } from '../../upload/upload.service';
import { LIVE_BETTING_CONFIG } from '../config/live-betting.config';
import * as fs from 'fs';

@Injectable()
export class LiveBettingService {
  private readonly logger = new Logger(LiveBettingService.name);

  constructor(
    @InjectRepository(LiveBet)
    private readonly liveBetRepository: Repository<LiveBet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
    @InjectRepository(CompetitorOdds)
    private readonly competitorOddsRepository: Repository<CompetitorOdds>,
    @InjectRepository(BettingWeek)
    private readonly bettingWeekRepository: Repository<BettingWeek>,
    @InjectRepository(RaceResult)
    private readonly raceResultRepository: Repository<RaceResult>,
    private readonly characterDetector: CharacterDetectorService,
    private readonly uploadService: UploadService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createLiveBet(
    userClerkId: string,
    competitorId: string,
    file: Express.Multer.File,
  ): Promise<LiveBet> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    // Check no existing active/detecting bet
    const existing = await this.liveBetRepository.findOne({
      where: {
        userId: user.id,
        status: In([LiveBetStatus.DETECTING, LiveBetStatus.ACTIVE]),
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have an active live bet. Wait for it to resolve or expire.',
      );
    }

    // Get oddFirst for the competitor
    const odd = await this.getOddForCompetitor(competitorId);

    // Check user has enough points to cover potential loss
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const ranking = await this.bettorRankingRepository.findOne({
      where: { userId: user.id, month, year },
    });
    const currentPoints = ranking?.totalPoints ?? 0;
    if (currentPoints < odd) {
      throw new BadRequestException(
        `Pas assez de points (${currentPoints}) pour couvrir la cote (${odd}). Il vous faut au moins ${Math.ceil(odd)} points.`,
      );
    }
    const expiresAt = new Date(
      now.getTime() + LIVE_BETTING_CONFIG.SESSION_EXPIRY_SECONDS * 1000,
    );

    // Read image as base64 for detection
    const filePath = this.uploadService.getFilePath(file.filename);
    const base64 = fs.readFileSync(filePath).toString('base64');
    const photoUrl = `/uploads/${file.filename}`;

    // Create bet with DETECTING status
    const liveBet = this.liveBetRepository.create({
      userId: user.id,
      competitorId,
      oddAtBet: odd,
      photoUrl,
      status: LiveBetStatus.DETECTING,
      expiresAt,
    });
    const saved = await this.liveBetRepository.save(liveBet);

    // Run detection asynchronously
    this.runDetection(saved.id, base64).catch((err) => {
      this.logger.error(
        `Detection failed for live bet ${saved.id}:`,
        err instanceof Error ? err.stack : undefined,
      );
    });

    return saved;
  }

  private async runDetection(
    liveBetId: string,
    base64: string,
  ): Promise<void> {
    const liveBet = await this.liveBetRepository.findOne({
      where: { id: liveBetId },
    });
    if (!liveBet || liveBet.status !== LiveBetStatus.DETECTING) return;

    try {
      const result = await this.characterDetector.detectCharacters(base64);

      const now = new Date();
      liveBet.detectedCharacters = result.characters;
      liveBet.detectionExpiresAt = new Date(
        now.getTime() +
          LIVE_BETTING_CONFIG.DETECTION_CONFIRM_SECONDS * 1000,
      );

      // Auto-confirm if all detections are confident
      if (!result.needsConfirmation) {
        liveBet.confirmedCompetitorIds = result.characters
          .filter((c) => c.competitorId)
          .map((c) => c.competitorId!);
        liveBet.status = LiveBetStatus.ACTIVE;
        this.logger.log(
          `Live bet ${liveBetId} auto-confirmed with ${liveBet.confirmedCompetitorIds.length} players`,
        );
      }

      await this.liveBetRepository.save(liveBet);

      // Notify user of detection result
      this.eventEmitter.emit('liveBet.detected', {
        userId: liveBet.userId,
        liveBet,
      });
    } catch (error) {
      liveBet.status = LiveBetStatus.CANCELLED;
      liveBet.cancellationReason = 'detection_failed';
      liveBet.resolvedAt = new Date();
      await this.liveBetRepository.save(liveBet);

      this.eventEmitter.emit('liveBet.cancelled', {
        userId: liveBet.userId,
        liveBet,
        reason: 'detection_failed',
      });
    }
  }

  async confirmDetection(
    liveBetId: string,
    userClerkId: string,
    competitorIds: string[],
  ): Promise<LiveBet> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const liveBet = await this.liveBetRepository.findOne({
      where: { id: liveBetId },
    });
    if (!liveBet) throw new NotFoundException('Live bet not found');
    if (liveBet.userId !== user.id) {
      throw new ForbiddenException('This is not your live bet');
    }
    if (liveBet.status !== LiveBetStatus.DETECTING) {
      throw new BadRequestException(
        `Live bet is ${liveBet.status}, cannot confirm detection`,
      );
    }

    liveBet.confirmedCompetitorIds = competitorIds;
    liveBet.status = LiveBetStatus.ACTIVE;
    await this.liveBetRepository.save(liveBet);

    this.logger.log(
      `Live bet ${liveBetId} confirmed by user with ${competitorIds.length} competitors`,
    );

    return liveBet;
  }

  async autoConfirmExpired(): Promise<void> {
    const now = new Date();

    const expiredDetecting = await this.liveBetRepository
      .createQueryBuilder('lb')
      .where('lb.status = :status', { status: LiveBetStatus.DETECTING })
      .andWhere('lb.detectionExpiresAt IS NOT NULL')
      .andWhere('lb.detectionExpiresAt < :now', { now })
      .andWhere('lb.detectedCharacters IS NOT NULL')
      .getMany();

    for (const liveBet of expiredDetecting) {
      const detectedWithCompetitor = (liveBet.detectedCharacters ?? []).filter(
        (c) => c.competitorId,
      );

      if (detectedWithCompetitor.length >= 2) {
        liveBet.confirmedCompetitorIds = detectedWithCompetitor.map(
          (c) => c.competitorId!,
        );
        liveBet.status = LiveBetStatus.ACTIVE;
        this.logger.log(
          `Live bet ${liveBet.id} auto-confirmed after timer expiry`,
        );
      } else {
        liveBet.status = LiveBetStatus.CANCELLED;
        liveBet.cancellationReason = 'detection_failed';
        liveBet.resolvedAt = new Date();
        this.logger.log(
          `Live bet ${liveBet.id} cancelled: insufficient detections`,
        );
      }

      await this.liveBetRepository.save(liveBet);
    }
  }

  async resolveForRace(race: RaceEvent): Promise<void> {
    await this.expireStale();

    const activeBets = await this.liveBetRepository.find({
      where: { status: LiveBetStatus.ACTIVE },
    });

    if (activeBets.length === 0) {
      this.logger.log('No active live bets to resolve');
      return;
    }

    const results = await this.raceResultRepository.find({
      where: { race: { id: race.id } },
    });
    const raceCompetitorIds = new Set(results.map((r) => r.competitorId));

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    for (const liveBet of activeBets) {
      if (liveBet.expiresAt < now) continue; // already expired, skip

      const betCompetitorIds = liveBet.confirmedCompetitorIds ?? [];
      if (betCompetitorIds.length === 0) continue;

      const overlap = betCompetitorIds.filter((id) =>
        raceCompetitorIds.has(id),
      );
      const overlapRatio = overlap.length / betCompetitorIds.length;

      if (overlapRatio < LIVE_BETTING_CONFIG.MIN_COMPETITOR_OVERLAP) {
        continue; // Not enough overlap, skip (might match a future race)
      }

      // Find winner: competitor with rank12 = 1 among confirmed competitors
      const winnerResult = results.find(
        (r) => r.rank12 === 1 && betCompetitorIds.includes(r.competitorId),
      );

      liveBet.raceEventId = race.id;
      liveBet.resolvedAt = now;

      if (!winnerResult) {
        // No confirmed competitor won (rank 1 not among confirmed)
        // Check if ANY confirmed competitor is in the race
        if (overlap.length > 0) {
          // Race matched but predicted competitor didn't win
          liveBet.status = LiveBetStatus.LOST;
          liveBet.pointsEarned = -liveBet.oddAtBet;
        } else {
          liveBet.status = LiveBetStatus.CANCELLED;
          liveBet.cancellationReason = 'no_match';
        }
      } else if (winnerResult.competitorId === liveBet.competitorId) {
        liveBet.status = LiveBetStatus.WON;
        liveBet.pointsEarned = liveBet.oddAtBet;
      } else {
        liveBet.status = LiveBetStatus.LOST;
        liveBet.pointsEarned = -liveBet.oddAtBet;
      }

      await this.liveBetRepository.save(liveBet);

      // Update bettor rankings
      if (liveBet.status === LiveBetStatus.WON) {
        await this.addPoints(
          liveBet.userId,
          liveBet.oddAtBet,
          month,
          year,
          true,
        );
      } else if (liveBet.status === LiveBetStatus.LOST) {
        await this.subtractPoints(
          liveBet.userId,
          liveBet.oddAtBet,
          month,
          year,
        );
      }

      this.eventEmitter.emit('liveBet.resolved', {
        userId: liveBet.userId,
        liveBet,
      });

      this.logger.log(
        `Live bet ${liveBet.id} resolved: ${liveBet.status}, points=${liveBet.pointsEarned ?? 0}`,
      );
    }
  }

  async expireStale(): Promise<void> {
    const now = new Date();

    const result = await this.liveBetRepository
      .createQueryBuilder()
      .update(LiveBet)
      .set({
        status: LiveBetStatus.CANCELLED,
        cancellationReason: 'timeout',
        resolvedAt: now,
      })
      .where('status IN (:...statuses)', {
        statuses: [LiveBetStatus.ACTIVE, LiveBetStatus.DETECTING],
      })
      .andWhere('expiresAt < :now', { now })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale live bets`);
    }
  }

  async getActiveBets(userClerkId: string): Promise<LiveBet[]> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.liveBetRepository.find({
      where: {
        userId: user.id,
        status: In([LiveBetStatus.DETECTING, LiveBetStatus.ACTIVE]),
      },
      relations: ['competitor'],
      order: { createdAt: 'DESC' },
    });
  }

  async getHistory(
    userClerkId: string,
    limit: number,
    offset: number,
  ): Promise<{ data: LiveBet[]; total: number }> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const [data, total] = await this.liveBetRepository.findAndCount({
      where: {
        userId: user.id,
        status: In([
          LiveBetStatus.WON,
          LiveBetStatus.LOST,
          LiveBetStatus.CANCELLED,
        ]),
      },
      relations: ['competitor'],
      order: { resolvedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }

  async getRecentResolved(limit: number): Promise<LiveBet[]> {
    return this.liveBetRepository.find({
      where: {
        status: In([LiveBetStatus.WON, LiveBetStatus.LOST]),
      },
      relations: ['competitor', 'user'],
      order: { resolvedAt: 'DESC' },
      take: limit,
    });
  }

  async getLiveBet(
    liveBetId: string,
    userClerkId: string,
  ): Promise<LiveBet> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const liveBet = await this.liveBetRepository.findOne({
      where: { id: liveBetId, userId: user.id },
      relations: ['competitor'],
    });
    if (!liveBet) throw new NotFoundException('Live bet not found');

    return liveBet;
  }

  private async getOddForCompetitor(competitorId: string): Promise<number> {
    // Try to get from current betting week
    const now = new Date();
    const currentWeek = await this.bettingWeekRepository.findOne({
      where: {
        status: In([BettingWeekStatus.OPEN, BettingWeekStatus.CLOSED]),
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
    });

    if (currentWeek) {
      const odds = await this.competitorOddsRepository
        .createQueryBuilder('odds')
        .where('odds.bettingWeekId = :weekId', { weekId: currentWeek.id })
        .andWhere('odds.competitorId = :competitorId', { competitorId })
        .orderBy('odds.calculatedAt', 'DESC')
        .getOne();

      if (odds) return odds.oddFirst;
    }

    // Fallback: get latest odds for this competitor from any week
    const latestOdds = await this.competitorOddsRepository
      .createQueryBuilder('odds')
      .where('odds.competitorId = :competitorId', { competitorId })
      .orderBy('odds.calculatedAt', 'DESC')
      .getOne();

    if (latestOdds) return latestOdds.oddFirst;

    // Default odd if nothing found
    return 2.0;
  }

  private async addPoints(
    userId: string,
    points: number,
    month: number,
    year: number,
    isWin: boolean,
  ): Promise<void> {
    await this.bettorRankingRepository.query(
      `INSERT INTO bettor_rankings ("userId", "month", "year", "totalPoints", "betsPlaced", "betsWon", "perfectBets", "boostsUsed", "rank")
       VALUES ($1, $2, $3, $4, 1, $5, 0, 0, 0)
       ON CONFLICT ("userId", "month", "year")
       DO UPDATE SET "totalPoints" = bettor_rankings."totalPoints" + $4,
                     "betsPlaced" = bettor_rankings."betsPlaced" + 1,
                     "betsWon" = bettor_rankings."betsWon" + $5,
                     "updatedAt" = NOW()`,
      [userId, month, year, points, isWin ? 1 : 0],
    );
  }

  private async subtractPoints(
    userId: string,
    points: number,
    month: number,
    year: number,
  ): Promise<void> {
    // First ensure the row exists
    await this.bettorRankingRepository.query(
      `INSERT INTO bettor_rankings ("userId", "month", "year", "totalPoints", "betsPlaced", "betsWon", "perfectBets", "boostsUsed", "rank")
       VALUES ($1, $2, $3, 0, 1, 0, 0, 0, 0)
       ON CONFLICT ("userId", "month", "year")
       DO UPDATE SET "totalPoints" = GREATEST(0, bettor_rankings."totalPoints" - $4),
                     "betsPlaced" = bettor_rankings."betsPlaced" + 1,
                     "updatedAt" = NOW()`,
      [userId, month, year, points],
    );
  }
}
