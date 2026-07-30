/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreakTrackerService } from '../streak-tracker.service';
import { UserStreak } from '../../entities/user-streak.entity';
import { User } from '../../../users/user.entity';
import { Competitor } from '../../../competitors/competitor.entity';
import { BettingWeek } from '../../../betting/entities/betting-week.entity';

/**
 * Weekly participation streak.
 *
 * The streak itself has nothing to do with betting: it counts consecutive
 * weeks of taking part. Only its trigger was a placed bet, and only its
 * week number was read off a BettingWeek row. Both are being decoupled, so
 * the counting rules are pinned here first.
 */
describe('StreakTrackerService — weekly participation streak', () => {
  let service: StreakTrackerService;
  let userStreakRepository: Repository<UserStreak>;
  let eventEmitter: EventEmitter2;

  const USER_ID = 'user-1';

  /** Existing streak row for the user, or null for a first-timer. */
  function withStreak(streak: Partial<UserStreak> | null) {
    jest
      .spyOn(userStreakRepository, 'findOne')
      .mockResolvedValue(streak as UserStreak | null);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakTrackerService,
        {
          provide: getRepositoryToken(UserStreak),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((v: unknown) => v),
            save: jest.fn((v: unknown) => v),
            update: jest.fn(),
          },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        {
          // Still injected today; goes away with the betting module.
          provide: getRepositoryToken(BettingWeek),
          useValue: { findOne: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StreakTrackerService);
    userStreakRepository = module.get(getRepositoryToken(UserStreak));
    eventEmitter = module.get(EventEmitter2);
  });

  it('starts a streak at 1 for a first-time participant', async () => {
    withStreak(null);

    const result = await service.updateStreak(USER_ID, 30, 2026);

    expect(result.currentMonthlyStreak).toBe(1);
    expect(result.currentLifetimeStreak).toBe(1);
    expect(result.lastParticipationWeekNumber).toBe(30);
    expect(result.lastParticipationYear).toBe(2026);
  });

  it('extends the streak on a consecutive week', async () => {
    withStreak({
      userId: USER_ID,
      currentMonthlyStreak: 3,
      currentLifetimeStreak: 8,
      lastParticipationWeekNumber: 29,
      lastParticipationYear: 2026,
      totalWeeksParticipated: 8,
    });

    const result = await service.updateStreak(USER_ID, 30, 2026);

    expect(result.currentMonthlyStreak).toBe(4);
    expect(result.currentLifetimeStreak).toBe(9);
  });

  it('bridges the new year when weeks are consecutive', async () => {
    withStreak({
      userId: USER_ID,
      currentMonthlyStreak: 2,
      currentLifetimeStreak: 5,
      lastParticipationWeekNumber: 52,
      lastParticipationYear: 2025,
      totalWeeksParticipated: 5,
    });

    const result = await service.updateStreak(USER_ID, 1, 2026);

    expect(result.currentMonthlyStreak).toBe(3);
  });

  it('leaves the streak untouched on a repeat within the same week', async () => {
    withStreak({
      userId: USER_ID,
      currentMonthlyStreak: 4,
      currentLifetimeStreak: 9,
      lastParticipationWeekNumber: 30,
      lastParticipationYear: 2026,
      totalWeeksParticipated: 9,
    });

    const result = await service.updateStreak(USER_ID, 30, 2026);

    expect(result.currentMonthlyStreak).toBe(4);
    expect(result.currentLifetimeStreak).toBe(9);
  });

  it('resets to 1 and records the loss when a week was skipped', async () => {
    withStreak({
      userId: USER_ID,
      currentMonthlyStreak: 6,
      currentLifetimeStreak: 11,
      lastParticipationWeekNumber: 27,
      lastParticipationYear: 2026,
      totalWeeksParticipated: 11,
    });

    const result = await service.updateStreak(USER_ID, 30, 2026);

    expect(result.currentMonthlyStreak).toBe(1);
    expect(result.currentLifetimeStreak).toBe(1);
    // The broken streak is kept so the loss modal can report it.
    expect(result.participationStreakLostValue).toBe(6);
    expect(result.participationStreakLossSeenAt).toBeNull();
  });

  it('emits a streak-lost event when a streak breaks', async () => {
    withStreak({
      userId: USER_ID,
      currentMonthlyStreak: 5,
      currentLifetimeStreak: 5,
      lastParticipationWeekNumber: 20,
      lastParticipationYear: 2026,
      totalWeeksParticipated: 5,
    });

    await service.updateStreak(USER_ID, 30, 2026);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'streak.participation_lost',
      expect.objectContaining({ userId: USER_ID, lostValue: 5 }),
    );
  });

  it('does not emit a loss when there was no streak to break', async () => {
    withStreak(null);

    await service.updateStreak(USER_ID, 30, 2026);

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'streak.participation_lost',
      expect.anything(),
    );
  });

  it('raises the lifetime best when the current streak passes it', async () => {
    withStreak({
      userId: USER_ID,
      currentMonthlyStreak: 4,
      currentLifetimeStreak: 9,
      longestLifetimeStreak: 9,
      lastParticipationWeekNumber: 29,
      lastParticipationYear: 2026,
      totalWeeksParticipated: 9,
    });

    const result = await service.updateStreak(USER_ID, 30, 2026);

    expect(result.longestLifetimeStreak).toBe(10);
  });
});
