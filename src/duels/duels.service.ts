import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Duel, DuelStatus } from './duel.entity';
import { User, UserRole } from '../users/user.entity';
import { BettorRanking } from '../betting/entities/bettor-ranking.entity';
import { RaceEvent } from '../races/race-event.entity';
import { RaceResult } from '../races/race-result.entity';
import { CreateDuelDto } from './dtos/create-duel.dto';

const PENDING_EXPIRY_MS = 60 * 1000; // 1 minute to accept
const ACCEPTED_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes once accepted
const MAX_ACTIVE_DUELS = 3;

@Injectable()
export class DuelsService {
  private readonly logger = new Logger(DuelsService.name);

  constructor(
    @InjectRepository(Duel)
    private readonly duelRepository: Repository<Duel>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BettorRanking)
    private readonly bettorRankingRepository: Repository<BettorRanking>,
    @InjectRepository(RaceResult)
    private readonly raceResultRepository: Repository<RaceResult>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createDuel(
    challengerClerkId: string,
    dto: CreateDuelDto,
  ): Promise<Duel> {
    const challenger = await this.userRepository.findOne({
      where: { clerkId: challengerClerkId },
    });
    if (!challenger) throw new NotFoundException('Challenger user not found');
    if (challenger.role !== UserRole.PLAYER || !challenger.competitorId) {
      throw new BadRequestException('You must be a PLAYER with a linked competitor to create a duel');
    }

    const challenged = await this.userRepository.findOne({
      where: { competitorId: dto.challengedCompetitorId },
    });
    if (!challenged) throw new NotFoundException('Challenged competitor not found');
    if (challenged.role !== UserRole.PLAYER) {
      throw new BadRequestException('Challenged user must be a PLAYER');
    }

    if (challenger.id === challenged.id) {
      throw new BadRequestException('You cannot duel yourself');
    }

    // Check no active duel between the two
    await this.expireStaleduels();
    const existingDuel = await this.duelRepository.findOne({
      where: [
        {
          challengerUserId: challenger.id,
          challengedUserId: challenged.id,
          status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]),
        },
        {
          challengerUserId: challenged.id,
          challengedUserId: challenger.id,
          status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]),
        },
      ],
    });
    if (existingDuel) {
      throw new BadRequestException('An active duel already exists between you two');
    }

    // Check max active duels
    const activeDuels = await this.duelRepository.count({
      where: [
        { challengerUserId: challenger.id, status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]) },
        { challengedUserId: challenger.id, status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]) },
      ],
    });
    if (activeDuels >= MAX_ACTIVE_DUELS) {
      throw new BadRequestException(`Maximum ${MAX_ACTIVE_DUELS} active duels allowed`);
    }

    // Check balance
    const now = new Date();
    const ranking = await this.getBettorRanking(challenger.id, now.getMonth() + 1, now.getFullYear());
    if ((ranking?.totalPoints ?? 0) < dto.stake) {
      throw new BadRequestException('Insufficient betting points');
    }

    const duel = this.duelRepository.create({
      challengerUserId: challenger.id,
      challengedUserId: challenged.id,
      challengerCompetitorId: challenger.competitorId,
      challengedCompetitorId: dto.challengedCompetitorId,
      stake: dto.stake,
      status: DuelStatus.PENDING,
      expiresAt: new Date(Date.now() + PENDING_EXPIRY_MS),
    });

    const saved = await this.duelRepository.save(duel);
    this.logger.log(`Duel ${saved.id} created: ${challenger.id} vs ${challenged.id}, stake=${dto.stake}`);

    this.eventEmitter.emit('duel.created', {
      duel: saved,
      challengerUser: challenger,
      challengedUser: challenged,
    });

    return saved;
  }

  async acceptDuel(duelId: string, userClerkId: string): Promise<Duel> {
    const user = await this.userRepository.findOne({ where: { clerkId: userClerkId } });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    if (duel.challengedUserId !== user.id) {
      throw new ForbiddenException('Only the challenged user can accept this duel');
    }

    // Lazy expiration check
    if (duel.status === DuelStatus.PENDING && new Date() > duel.expiresAt) {
      duel.status = DuelStatus.CANCELLED;
      await this.duelRepository.save(duel);
      throw new BadRequestException('This duel has expired');
    }

    if (duel.status !== DuelStatus.PENDING) {
      throw new BadRequestException(`Duel is ${duel.status}, cannot accept`);
    }

    // Check max active duels for challenged
    const activeDuels = await this.duelRepository.count({
      where: [
        { challengerUserId: user.id, status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]) },
        { challengedUserId: user.id, status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]) },
      ],
    });
    if (activeDuels >= MAX_ACTIVE_DUELS) {
      throw new BadRequestException(`Maximum ${MAX_ACTIVE_DUELS} active duels allowed`);
    }

    // Check balance
    const now = new Date();
    const ranking = await this.getBettorRanking(user.id, now.getMonth() + 1, now.getFullYear());
    if ((ranking?.totalPoints ?? 0) < duel.stake) {
      throw new BadRequestException('Insufficient betting points');
    }

    duel.status = DuelStatus.ACCEPTED;
    duel.acceptedAt = now;
    duel.expiresAt = new Date(Date.now() + ACCEPTED_EXPIRY_MS);

    const saved = await this.duelRepository.save(duel);
    this.logger.log(`Duel ${saved.id} accepted`);

    this.eventEmitter.emit('duel.accepted', { duel: saved });

    return saved;
  }

  async declineDuel(duelId: string, userClerkId: string): Promise<Duel> {
    const user = await this.userRepository.findOne({ where: { clerkId: userClerkId } });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    if (duel.challengedUserId !== user.id) {
      throw new ForbiddenException('Only the challenged user can decline this duel');
    }
    if (duel.status !== DuelStatus.PENDING) {
      throw new BadRequestException(`Duel is ${duel.status}, cannot decline`);
    }

    duel.status = DuelStatus.DECLINED;
    const saved = await this.duelRepository.save(duel);
    this.logger.log(`Duel ${saved.id} declined`);

    this.eventEmitter.emit('duel.declined', { duel: saved });

    return saved;
  }

  async cancelDuel(duelId: string, userClerkId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { clerkId: userClerkId } });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    if (duel.challengerUserId !== user.id) {
      throw new ForbiddenException('Only the challenger can cancel this duel');
    }
    if (duel.status !== DuelStatus.PENDING) {
      throw new BadRequestException(`Duel is ${duel.status}, cannot cancel`);
    }

    duel.status = DuelStatus.CANCELLED;
    await this.duelRepository.save(duel);
    this.logger.log(`Duel ${duel.id} cancelled by challenger`);

    this.eventEmitter.emit('duel.cancelled', { duel, reason: 'cancelled' });
  }

  async getMyDuels(
    userClerkId: string,
    status?: string,
  ): Promise<Duel[]> {
    const user = await this.userRepository.findOne({ where: { clerkId: userClerkId } });
    if (!user) throw new NotFoundException('User not found');

    await this.expireStaleduels();

    const qb = this.duelRepository
      .createQueryBuilder('duel')
      .leftJoinAndSelect('duel.challengerUser', 'challenger')
      .leftJoinAndSelect('duel.challengedUser', 'challenged')
      .where(
        '(duel.challengerUserId = :userId OR duel.challengedUserId = :userId)',
        { userId: user.id },
      )
      .orderBy('duel.createdAt', 'DESC');

    if (status) {
      qb.andWhere('duel.status = :status', { status });
    }

    return qb.getMany();
  }

  async getDuelFeed(limit: number, offset: number): Promise<{ data: Duel[]; total: number }> {
    const [data, total] = await this.duelRepository.findAndCount({
      where: { status: DuelStatus.RESOLVED },
      relations: ['challengerUser', 'challengedUser'],
      order: { resolvedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async resolveDuelsForRace(race: RaceEvent): Promise<void> {
    // Expire any stale accepted duels first
    await this.expireStaleduels();

    const acceptedDuels = await this.duelRepository.find({
      where: { status: DuelStatus.ACCEPTED },
    });

    if (acceptedDuels.length === 0) {
      this.logger.log('No accepted duels to resolve');
      return;
    }

    const results = await this.raceResultRepository.find({
      where: { race: { id: race.id } },
    });
    const resultsByCompetitor = new Map(results.map((r) => [r.competitorId, r]));

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    for (const duel of acceptedDuels) {
      const challengerResult = resultsByCompetitor.get(duel.challengerCompetitorId);
      const challengedResult = resultsByCompetitor.get(duel.challengedCompetitorId);

      if (!challengerResult || !challengedResult) {
        // One or both absent → cancel, refund
        duel.status = DuelStatus.CANCELLED;
        duel.raceEventId = race.id;
        duel.resolvedAt = now;
        await this.duelRepository.save(duel);

        this.eventEmitter.emit('duel.cancelled', { duel, reason: 'absent' });
        this.logger.log(`Duel ${duel.id} cancelled: competitor(s) absent from race ${race.id}`);
        continue;
      }

      duel.raceEventId = race.id;
      duel.resolvedAt = now;

      if (challengerResult.rank12 === challengedResult.rank12) {
        // Tie → refund both
        duel.status = DuelStatus.CANCELLED;
        await this.duelRepository.save(duel);

        this.eventEmitter.emit('duel.cancelled', { duel, reason: 'tie' });
        this.logger.log(`Duel ${duel.id} tied: both rank ${challengerResult.rank12}`);
        continue;
      }

      // Lower rank12 = better placement
      const challengerWins = challengerResult.rank12 < challengedResult.rank12;
      duel.winnerUserId = challengerWins ? duel.challengerUserId : duel.challengedUserId;
      duel.loserUserId = challengerWins ? duel.challengedUserId : duel.challengerUserId;
      duel.status = DuelStatus.RESOLVED;

      await this.duelRepository.save(duel);

      // Transfer points
      await this.transferPoints(duel.winnerUserId, duel.loserUserId, duel.stake, month, year);

      this.eventEmitter.emit('duel.resolved', { duel });
      this.logger.log(
        `Duel ${duel.id} resolved: winner=${duel.winnerUserId}, stake=${duel.stake}`,
      );
    }
  }

  private async transferPoints(
    winnerUserId: string,
    loserUserId: string,
    stake: number,
    month: number,
    year: number,
  ): Promise<void> {
    // Winner: +stake
    await this.bettorRankingRepository.query(
      `INSERT INTO bettor_rankings ("userId", "month", "year", "totalPoints", "betsPlaced", "betsWon", "perfectBets", "boostsUsed", "rank")
       VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
       ON CONFLICT ("userId", "month", "year")
       DO UPDATE SET "totalPoints" = bettor_rankings."totalPoints" + $4,
                     "updatedAt" = NOW()`,
      [winnerUserId, month, year, stake],
    );

    // Loser: -stake (floor at 0)
    await this.bettorRankingRepository.query(
      `UPDATE bettor_rankings
       SET "totalPoints" = GREATEST(0, "totalPoints" - $1),
           "updatedAt" = NOW()
       WHERE "userId" = $2 AND "month" = $3 AND "year" = $4`,
      [stake, loserUserId, month, year],
    );
  }

  private async expireStaleduels(): Promise<void> {
    const now = new Date();

    // Expire PENDING duels past their 1-minute window
    const expiredPending = await this.duelRepository
      .createQueryBuilder()
      .update(Duel)
      .set({ status: DuelStatus.CANCELLED })
      .where('status = :status', { status: DuelStatus.PENDING })
      .andWhere('expiresAt < :now', { now })
      .execute();

    if (expiredPending.affected && expiredPending.affected > 0) {
      this.logger.log(`Expired ${expiredPending.affected} pending duels`);
    }

    // Expire ACCEPTED duels past their 15-minute window
    const expiredAccepted = await this.duelRepository
      .createQueryBuilder()
      .update(Duel)
      .set({ status: DuelStatus.CANCELLED })
      .where('status = :status', { status: DuelStatus.ACCEPTED })
      .andWhere('expiresAt < :now', { now })
      .execute();

    if (expiredAccepted.affected && expiredAccepted.affected > 0) {
      this.logger.log(`Expired ${expiredAccepted.affected} accepted duels`);
    }
  }

  private async getBettorRanking(
    userId: string,
    month: number,
    year: number,
  ): Promise<BettorRanking | null> {
    return this.bettorRankingRepository.findOne({
      where: { userId, month, year },
    });
  }
}
