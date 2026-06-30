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
import { Duel, DuelStatus, StakeType, DuelConditionType } from './duel.entity';
import { User, UserRole } from '../users/user.entity';
import { RaceEvent } from '../races/race-event.entity';
import { RaceResult } from '../races/race-result.entity';
import { WeekManagerService } from '../betting/services/week-manager.service';
import { UploadService } from '../upload/upload.service';
import { CreateDuelDto } from './dtos/create-duel.dto';

const PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days to accept
const DEFAULT_RESOLVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // duel stands up to 2 weeks
const MAX_ACTIVE_DUELS = 10;

const STAKE_EMOJI: Record<StakeType, string> = {
  [StakeType.BEER]: '🍺',
  [StakeType.PINT]: '🍻',
  [StakeType.MARS]: '🍫',
  [StakeType.MEAL]: '🍽️',
  [StakeType.CUSTOM]: '🎯',
};

export interface DuelBalanceItem {
  stakeType: StakeType;
  stakeEmoji: string;
  stakeLabel: string | null;
  count: number;
}

export interface DuelBalance {
  counterpart: {
    id: string;
    clerkId: string;
    firstName: string;
    lastName: string;
    profilePictureUrl: string;
  };
  owedToMe: DuelBalanceItem[];
  iOwe: DuelBalanceItem[];
}

@Injectable()
export class DuelsService {
  private readonly logger = new Logger(DuelsService.name);

  constructor(
    @InjectRepository(Duel)
    private readonly duelRepository: Repository<Duel>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RaceResult)
    private readonly raceResultRepository: Repository<RaceResult>,
    private readonly weekManager: WeekManagerService,
    private readonly uploadService: UploadService,
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
      throw new BadRequestException(
        'You must be a PLAYER with a linked competitor to create a duel',
      );
    }

    const challenged = await this.userRepository.findOne({
      where: { competitorId: dto.challengedCompetitorId },
    });
    if (!challenged)
      throw new NotFoundException('Challenged competitor not found');
    if (challenged.role !== UserRole.PLAYER) {
      throw new BadRequestException('Challenged user must be a PLAYER');
    }

    if (challenger.id === challenged.id) {
      throw new BadRequestException('You cannot duel yourself');
    }

    this.validateStakeAndCondition(dto);

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
      throw new BadRequestException(
        'An active duel already exists between you two',
      );
    }

    // Check max active duels
    const activeDuels = await this.duelRepository.count({
      where: [
        {
          challengerUserId: challenger.id,
          status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]),
        },
        {
          challengedUserId: challenger.id,
          status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]),
        },
      ],
    });
    if (activeDuels >= MAX_ACTIVE_DUELS) {
      throw new BadRequestException(
        `Maximum ${MAX_ACTIVE_DUELS} active duels allowed`,
      );
    }

    // Scope the duel to the current betting week (null = next race regardless)
    const currentWeek = await this.weekManager.getCurrentWeek();

    const duel = this.duelRepository.create({
      challengerUserId: challenger.id,
      challengedUserId: challenged.id,
      challengerCompetitorId: challenger.competitorId,
      challengedCompetitorId: dto.challengedCompetitorId,
      stakeType: dto.stakeType,
      stakeLabel:
        dto.stakeType === StakeType.CUSTOM ? (dto.stakeLabel ?? null) : null,
      stakeEmoji: STAKE_EMOJI[dto.stakeType],
      conditionType: dto.conditionType ?? null,
      conditionValue: dto.conditionValue ?? null,
      targetBettingWeekId: currentWeek?.id ?? null,
      status: DuelStatus.PENDING,
      expiresAt: new Date(Date.now() + PENDING_EXPIRY_MS),
    });

    const saved = await this.duelRepository.save(duel);
    this.logger.log(
      `Duel ${saved.id} created: ${challenger.id} vs ${challenged.id}, stake=${dto.stakeType}`,
    );

    this.eventEmitter.emit('duel.created', {
      duel: saved,
      challengerUser: challenger,
      challengedUser: challenged,
    });

    return saved;
  }

  private validateStakeAndCondition(dto: CreateDuelDto): void {
    if (dto.stakeType === StakeType.CUSTOM && !dto.stakeLabel?.trim()) {
      throw new BadRequestException('A custom stake requires a label');
    }
    if (
      (dto.conditionType === DuelConditionType.MARGIN_GREATER ||
        dto.conditionType === DuelConditionType.MARGIN_BETWEEN) &&
      (dto.conditionValue == null || dto.conditionValue < 1)
    ) {
      throw new BadRequestException(
        'This condition requires a positive conditionValue',
      );
    }
  }

  async acceptDuel(duelId: string, userClerkId: string): Promise<Duel> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    if (duel.challengedUserId !== user.id) {
      throw new ForbiddenException(
        'Only the challenged user can accept this duel',
      );
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
        {
          challengerUserId: user.id,
          status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]),
        },
        {
          challengedUserId: user.id,
          status: In([DuelStatus.PENDING, DuelStatus.ACCEPTED]),
        },
      ],
    });
    if (activeDuels >= MAX_ACTIVE_DUELS) {
      throw new BadRequestException(
        `Maximum ${MAX_ACTIVE_DUELS} active duels allowed`,
      );
    }

    const now = new Date();
    duel.status = DuelStatus.ACCEPTED;
    duel.acceptedAt = now;
    duel.resolveDeadline = new Date(now.getTime() + DEFAULT_RESOLVE_WINDOW_MS);

    const saved = await this.duelRepository.save(duel);
    this.logger.log(`Duel ${saved.id} accepted`);

    this.eventEmitter.emit('duel.accepted', { duel: saved });

    return saved;
  }

  async declineDuel(duelId: string, userClerkId: string): Promise<Duel> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    if (duel.challengedUserId !== user.id) {
      throw new ForbiddenException(
        'Only the challenged user can decline this duel',
      );
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
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
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

  async getMyDuels(userClerkId: string, status?: string): Promise<Duel[]> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
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

  async getDuelFeed(
    limit: number,
    offset: number,
  ): Promise<{ data: Duel[]; total: number }> {
    const [data, total] = await this.duelRepository.findAndCount({
      where: {
        status: In([DuelStatus.AWAITING_SETTLEMENT, DuelStatus.SETTLED]),
      },
      relations: ['challengerUser', 'challengedUser'],
      order: { resolvedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async resolveDuelsForRace(race: RaceEvent): Promise<void> {
    // Cancel any accepted duels whose resolve deadline has passed
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
    const resultsByCompetitor = new Map(
      results.map((r) => [r.competitorId, r]),
    );

    const now = new Date();

    for (const duel of acceptedDuels) {
      // Only resolve against races in the duel's target week (if scoped).
      if (
        duel.targetBettingWeekId &&
        race.bettingWeekId !== duel.targetBettingWeekId
      ) {
        continue;
      }

      const challengerResult = resultsByCompetitor.get(
        duel.challengerCompetitorId,
      );
      const challengedResult = resultsByCompetitor.get(
        duel.challengedCompetitorId,
      );

      // Wait for the first race where BOTH competitors appear — absence is not
      // a cancel, only resolveDeadline expiry cancels (in expireStaleduels).
      if (!challengerResult || !challengedResult) {
        continue;
      }

      duel.raceEventId = race.id;
      duel.resolvedAt = now;

      const outcome = this.evaluateDuel(
        duel,
        challengerResult,
        challengedResult,
      );

      if (outcome === 'draw') {
        duel.status = DuelStatus.CANCELLED;
        await this.duelRepository.save(duel);
        this.eventEmitter.emit('duel.cancelled', { duel, reason: 'tie' });
        this.logger.log(`Duel ${duel.id} tied: no debt`);
        continue;
      }

      const challengerWins = outcome === 'challenger';
      duel.winnerUserId = challengerWins
        ? duel.challengerUserId
        : duel.challengedUserId;
      duel.loserUserId = challengerWins
        ? duel.challengedUserId
        : duel.challengerUserId;
      duel.status = DuelStatus.AWAITING_SETTLEMENT;

      await this.duelRepository.save(duel);

      this.eventEmitter.emit('duel.resolved', { duel });
      this.logger.log(
        `Duel ${duel.id} resolved: winner=${duel.winnerUserId}, stake=${duel.stakeType}`,
      );
    }
  }

  /**
   * Evaluate a duel given both competitors' race results.
   * Returns who the bet favours. The challenger is the condition-setter.
   */
  private evaluateDuel(
    duel: Duel,
    a: RaceResult,
    b: RaceResult,
  ): 'challenger' | 'challenged' | 'draw' {
    const conditionType = duel.conditionType ?? DuelConditionType.RANK_WINS;
    const x = duel.conditionValue ?? 0;

    switch (conditionType) {
      case DuelConditionType.RANK_WINS: {
        if (a.rank12 === b.rank12) return 'draw';
        return a.rank12 < b.rank12 ? 'challenger' : 'challenged';
      }
      case DuelConditionType.MARGIN_GREATER: {
        // Challenger wins only if better-ranked AND beats by more than X points
        const margin = a.score - b.score;
        return a.rank12 < b.rank12 && margin > x ? 'challenger' : 'challenged';
      }
      case DuelConditionType.EXACT_TIE: {
        // Challenger bets on an exact rank tie
        return a.rank12 === b.rank12 ? 'challenger' : 'challenged';
      }
      case DuelConditionType.MARGIN_BETWEEN: {
        // Condition met if the score gap is at least X; then better rank wins,
        // else the condition-setter (challenger) loses.
        const gap = Math.abs(a.score - b.score);
        if (gap < x) return 'challenged';
        if (a.rank12 === b.rank12) return 'draw';
        return a.rank12 < b.rank12 ? 'challenger' : 'challenged';
      }
      default:
        return 'draw';
    }
  }

  async uploadProof(
    duelId: string,
    userClerkId: string,
    file: Express.Multer.File,
  ): Promise<Duel> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');

    if (duel.status !== DuelStatus.AWAITING_SETTLEMENT) {
      this.uploadService.removeFile(file.filename);
      throw new BadRequestException(
        `Duel is ${duel.status}, cannot upload proof`,
      );
    }
    if (duel.loserUserId !== user.id) {
      this.uploadService.removeFile(file.filename);
      throw new ForbiddenException(
        'Only the player who owes the stake can upload proof',
      );
    }

    const publicUrl = this.uploadService.moveToProofs(file.filename);
    const now = new Date();
    duel.proofPhotoUrl = publicUrl;
    duel.proofUploadedAt = now;
    duel.settledAt = now;
    duel.status = DuelStatus.SETTLED;

    const saved = await this.duelRepository.save(duel);
    this.logger.log(`Duel ${saved.id} settled with proof`);

    this.eventEmitter.emit('duel.settled', { duel: saved });

    return saved;
  }

  async undoProof(duelId: string, userClerkId: string): Promise<Duel> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const duel = await this.duelRepository.findOne({ where: { id: duelId } });
    if (!duel) throw new NotFoundException('Duel not found');
    if (duel.status !== DuelStatus.SETTLED) {
      throw new BadRequestException(`Duel is ${duel.status}, nothing to undo`);
    }
    if (duel.loserUserId !== user.id) {
      throw new ForbiddenException(
        'Only the player who settled can undo the proof',
      );
    }

    if (duel.proofPhotoUrl) {
      this.uploadService.removeProofImage(duel.proofPhotoUrl);
    }
    duel.proofPhotoUrl = null;
    duel.proofUploadedAt = null;
    duel.settledAt = null;
    duel.status = DuelStatus.AWAITING_SETTLEMENT;

    const saved = await this.duelRepository.save(duel);
    this.logger.log(`Duel ${saved.id} proof undone`);

    this.eventEmitter.emit('duel.unsettled', { duel: saved });

    return saved;
  }

  /**
   * Splitwise-style balances: real-world stakes are not summable, so we return
   * per-friend counts grouped by stake item across unsettled resolved duels.
   */
  async getBalances(userClerkId: string): Promise<DuelBalance[]> {
    const user = await this.userRepository.findOne({
      where: { clerkId: userClerkId },
    });
    if (!user) throw new NotFoundException('User not found');

    const duels = await this.duelRepository.find({
      where: [
        {
          status: DuelStatus.AWAITING_SETTLEMENT,
          winnerUserId: user.id,
        },
        {
          status: DuelStatus.AWAITING_SETTLEMENT,
          loserUserId: user.id,
        },
      ],
      relations: ['challengerUser', 'challengedUser'],
    });

    const byCounterpart = new Map<string, DuelBalance>();

    for (const duel of duels) {
      const iWon = duel.winnerUserId === user.id;
      const counterpartUser =
        duel.challengerUserId === user.id
          ? duel.challengedUser
          : duel.challengerUser;
      if (!counterpartUser) continue;

      let entry = byCounterpart.get(counterpartUser.id);
      if (!entry) {
        entry = {
          counterpart: {
            id: counterpartUser.id,
            clerkId: counterpartUser.clerkId,
            firstName: counterpartUser.firstName,
            lastName: counterpartUser.lastName,
            profilePictureUrl: counterpartUser.profilePictureUrl,
          },
          owedToMe: [],
          iOwe: [],
        };
        byCounterpart.set(counterpartUser.id, entry);
      }

      const bucket = iWon ? entry.owedToMe : entry.iOwe;
      this.addStakeToBucket(bucket, duel);
    }

    return Array.from(byCounterpart.values());
  }

  private addStakeToBucket(bucket: DuelBalanceItem[], duel: Duel): void {
    const label = duel.stakeType === StakeType.CUSTOM ? duel.stakeLabel : null;
    const existing = bucket.find(
      (i) => i.stakeType === duel.stakeType && i.stakeLabel === label,
    );
    if (existing) {
      existing.count += 1;
    } else {
      bucket.push({
        stakeType: duel.stakeType,
        stakeEmoji: duel.stakeEmoji ?? STAKE_EMOJI[duel.stakeType],
        stakeLabel: label,
        count: 1,
      });
    }
  }

  private async expireStaleduels(): Promise<void> {
    const now = new Date();

    // Expire PENDING duels past their accept window
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

    // Cancel ACCEPTED duels whose resolve deadline passed without a race
    const expiredAccepted = await this.duelRepository
      .createQueryBuilder()
      .update(Duel)
      .set({ status: DuelStatus.CANCELLED })
      .where('status = :status', { status: DuelStatus.ACCEPTED })
      .andWhere('"resolveDeadline" IS NOT NULL')
      .andWhere('"resolveDeadline" < :now', { now })
      .execute();

    if (expiredAccepted.affected && expiredAccepted.affected > 0) {
      this.logger.log(
        `Cancelled ${expiredAccepted.affected} accepted duels past deadline`,
      );
    }
  }
}
