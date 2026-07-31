/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreakTrackerService } from '../streak-tracker.service';
import { UserStreak } from '../../entities/user-streak.entity';
import { User } from '../../../users/user.entity';
import { Competitor } from '../../../competitors/competitor.entity';

/**
 * Streak-loss reads and writes moved out of BettingService.
 *
 * These two methods look like betting code but are not: `playStreakLoss`
 * reads `competitor.playStreakLostValue`, which tracks the Mario Kart race
 * streak. Deleting them with the betting module would break the play-streak
 * modal for every player, so they live here now.
 */
/** `expect.any()` is typed as `any` upstream; narrow it once here. */
const anyDate = (): Date => expect.any(Date) as Date;

describe('StreakTrackerService — streak losses', () => {
  let service: StreakTrackerService;
  let userStreakRepository: Repository<UserStreak>;
  let userRepository: Repository<User>;
  let competitorRepository: Repository<Competitor>;

  const USER_ID = 'user-1';
  const COMPETITOR_ID = 'competitor-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakTrackerService,
        {
          provide: getRepositoryToken(UserStreak),
          useValue: { findOne: jest.fn(), update: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StreakTrackerService);
    userStreakRepository = module.get(getRepositoryToken(UserStreak));
    userRepository = module.get(getRepositoryToken(User));
    competitorRepository = module.get(getRepositoryToken(Competitor));
  });

  describe('getUnseenStreakLosses', () => {
    it('reports a participation streak loss that has not been seen', async () => {
      const lostAt = new Date('2026-07-01T10:00:00Z');
      jest.spyOn(userStreakRepository, 'findOne').mockResolvedValue({
        userId: USER_ID,
        participationStreakLostValue: 5,
        participationStreakLostAt: lostAt,
        participationStreakLossSeenAt: null,
      } as unknown as UserStreak);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getUnseenStreakLosses(USER_ID);

      expect(result.participationStreakLoss).toEqual({ lostValue: 5, lostAt });
      expect(result.playStreakLoss).toBeNull();
    });

    it('hides a participation streak loss already seen', async () => {
      jest.spyOn(userStreakRepository, 'findOne').mockResolvedValue({
        userId: USER_ID,
        participationStreakLostValue: 5,
        participationStreakLostAt: new Date(),
        participationStreakLossSeenAt: new Date(),
      } as unknown as UserStreak);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getUnseenStreakLosses(USER_ID);

      expect(result.participationStreakLoss).toBeNull();
    });

    it('reports an unseen play streak loss from the linked competitor', async () => {
      const lostAt = new Date('2026-07-02T10:00:00Z');
      jest.spyOn(userStreakRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        id: USER_ID,
        competitorId: COMPETITOR_ID,
      } as User);
      jest.spyOn(competitorRepository, 'findOne').mockResolvedValue({
        id: COMPETITOR_ID,
        playStreakLostValue: 3,
        playStreakLostAt: lostAt,
        playStreakLossSeenAt: null,
        playStreakMissedDays: '2026-07-01,2026-07-02',
      } as unknown as Competitor);

      const result = await service.getUnseenStreakLosses(USER_ID);

      expect(result.playStreakLoss).toEqual({
        lostValue: 3,
        lostAt,
        missedDays: ['2026-07-01', '2026-07-02'],
      });
    });

    it('returns an empty missedDays list when none are recorded', async () => {
      jest.spyOn(userStreakRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        id: USER_ID,
        competitorId: COMPETITOR_ID,
      } as User);
      jest.spyOn(competitorRepository, 'findOne').mockResolvedValue({
        id: COMPETITOR_ID,
        playStreakLostValue: 2,
        playStreakLostAt: new Date(),
        playStreakLossSeenAt: null,
        playStreakMissedDays: null,
      } as unknown as Competitor);

      const result = await service.getUnseenStreakLosses(USER_ID);

      expect(result.playStreakLoss?.missedDays).toEqual([]);
    });

    it('reports no play streak loss when the user has no competitor', async () => {
      jest.spyOn(userStreakRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ id: USER_ID, competitorId: null } as User);

      const result = await service.getUnseenStreakLosses(USER_ID);

      expect(result.playStreakLoss).toBeNull();
      expect(competitorRepository.findOne).not.toHaveBeenCalled();
    });

    it('returns both nulls when nothing was lost', async () => {
      jest.spyOn(userStreakRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getUnseenStreakLosses(USER_ID);

      expect(result).toEqual({
        participationStreakLoss: null,
        playStreakLoss: null,
      });
    });
  });

  describe('markStreakLossesSeen', () => {
    it('stamps both the participation streak and the competitor play streak', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        id: USER_ID,
        competitorId: COMPETITOR_ID,
      } as User);

      await service.markStreakLossesSeen(USER_ID);

      expect(userStreakRepository.update).toHaveBeenCalledWith(
        { userId: USER_ID },
        expect.objectContaining({
          participationStreakLossSeenAt: anyDate(),
        }),
      );
      expect(competitorRepository.update).toHaveBeenCalledWith(
        COMPETITOR_ID,
        expect.objectContaining({ playStreakLossSeenAt: anyDate() }),
      );
    });

    it('skips the competitor update when the user has none', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ id: USER_ID, competitorId: null } as User);

      await service.markStreakLossesSeen(USER_ID);

      expect(userStreakRepository.update).toHaveBeenCalled();
      expect(competitorRepository.update).not.toHaveBeenCalled();
    });
  });
});
