import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RacesService } from '../races.service';
import { RaceEvent } from '../race-event.entity';
import { CreateRaceDto } from '../dtos/create-race.dto';
import { RaceEventRepository } from '../repositories/race-event.repository';
import type { CompetitorsService } from '../../competitors/competitors.service';

/**
 * Duplicate guard on race creation.
 *
 * On 2026-08-04 the same four-player race was submitted twice, 65 seconds
 * apart, and both rows landed in production. The guard existed but only
 * matched on the set of competitors within a +/-60s window, so the second
 * submission fell five seconds outside it.
 *
 * Widening the window alone would have broken the normal case: that same
 * group raced again at 11:17 and 11:28 with completely different podiums.
 * Those are distinct races. So the guard now needs both halves to agree —
 * a wider window AND identical results — and the tests below pin each half
 * against the other, since loosening either one silently re-opens the bug it
 * was meant to close.
 */
describe('RacesService duplicate guard', () => {
  // The fixtures below are timestamped on the day of the incident. Server
  // time has to sit there too, otherwise every case would read as a badly
  // skewed client and take the two-window path meant for that situation.
  // The skew tests override this with their own setSystemTime.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-04T11:06:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const A = 'competitor-a';
  const B = 'competitor-b';
  const C = 'competitor-c';
  const D = 'competitor-d';

  /** The four-player race from the incident, in finishing order. */
  const INCIDENT_RESULTS = [
    { competitorId: A, rank12: 1, score: 60 },
    { competitorId: B, rank12: 2, score: 45 },
    { competitorId: C, rank12: 3, score: 39 },
    { competitorId: D, rank12: 4, score: 30 },
  ];

  /** The 11:28 rerun: same four players, different podium and scores. */
  const RERUN_RESULTS = [
    { competitorId: D, rank12: 1, score: 58 },
    { competitorId: C, rank12: 2, score: 47 },
    { competitorId: A, rank12: 3, score: 41 },
    { competitorId: B, rank12: 4, score: 28 },
  ];

  /**
   * A row as it comes back from `find({ relations: ['results'] })`.
   *
   * `date` matters: the guard filters on it through the repository, so the
   * fake `find` below has to honour the Between() range the service passes.
   */
  function storedRace(
    id: string,
    date: string,
    results: typeof INCIDENT_RESULTS,
  ): RaceEvent {
    return { id, date: new Date(date), results } as unknown as RaceEvent;
  }

  function dto(date: string, results: typeof INCIDENT_RESULTS): CreateRaceDto {
    return { date, results } as CreateRaceDto;
  }

  /**
   * Build the service with a repository whose `find` applies the date range
   * the service asked for, so the window width is genuinely under test rather
   * than assumed.
   */
  function buildService(existing: RaceEvent[]) {
    const find = jest.fn(({ where }: { where: { date: unknown } }) => {
      // TypeORM's Between() carries its bounds in `_value`.
      const [from, to] = (where.date as { _value: [Date, Date] })._value;
      return Promise.resolve(
        existing.filter(
          (r) =>
            r.date.getTime() >= from.getTime() &&
            r.date.getTime() <= to.getTime(),
        ),
      );
    });

    const save = jest.fn((race: RaceEvent) =>
      Promise.resolve({ ...race, id: 'saved-race', results: race.results }),
    );

    const raceEventRepository = {
      repository: { find },
      save,
    } as unknown as RaceEventRepository;

    // Every post-save side effect is fire-and-forget for these tests; the
    // guard runs before any of them.
    const competitorsService = {
      updateRatingsForRace: jest.fn().mockResolvedValue(undefined),
      markAsActiveThisWeek: jest.fn().mockResolvedValue(undefined),
      updatePlayStreak: jest.fn().mockResolvedValue(undefined),
      updateWinStreak: jest.fn().mockResolvedValue(undefined),
      updateRecentPositions: jest.fn().mockResolvedValue(undefined),
    } as unknown as CompetitorsService;

    const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;

    const service = new RacesService(
      raceEventRepository,
      competitorsService,
      eventEmitter,
    );

    return { service, save, find };
  }

  it('rejects the re-submission that slipped through at 65 seconds', async () => {
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:05:42Z', INCIDENT_RESULTS)),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(save).not.toHaveBeenCalled();
  });

  it('accepts two genuine races 11 minutes apart with different results', async () => {
    // 11:17 and 11:28: inside no single window, but more importantly the
    // results differ, which is what makes them distinct races.
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:17:00Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:28:00Z', RERUN_RESULTS)),
    ).resolves.toBeDefined();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('accepts a rerun inside the window when the podium changed', async () => {
    // The stricter case: same four players, two minutes apart, so the window
    // does overlap. Only the results tell these apart, and a guard that
    // matched on the player set alone would wrongly reject this one.
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:17:00Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:19:00Z', RERUN_RESULTS)),
    ).resolves.toBeDefined();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('treats a race as duplicate regardless of the order rows were sent in', async () => {
    // The client builds the array from whatever order the form was filled in.
    // Same race, rows shuffled, must still collide.
    const shuffled = [...INCIDENT_RESULTS].reverse();
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:05:42Z', shuffled)),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(save).not.toHaveBeenCalled();
  });

  it('accepts an identical result set once the window has passed', async () => {
    // Same players and same scores six minutes later is unusual but legal;
    // beyond the window we stop second-guessing the user.
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:11:00Z', INCIDENT_RESULTS)),
    ).resolves.toBeDefined();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate whose scores match but was re-sent 4 minutes later', async () => {
    // Inside the widened window and identical: the case the old 60s window
    // could not see at all.
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:08:37Z', INCIDENT_RESULTS)),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(save).not.toHaveBeenCalled();
  });

  it('accepts a race where only one score differs', async () => {
    // A single corrected score means the user is fixing a typo by entering a
    // second race, not re-sending the first. Ranks identical, one score off.
    const corrected = INCIDENT_RESULTS.map((r) =>
      r.competitorId === D ? { ...r, score: 31 } : r,
    );
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:05:42Z', corrected)),
    ).resolves.toBeDefined();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not match a race with a different set of players', async () => {
    const otherField = [
      { competitorId: A, rank12: 1, score: 60 },
      { competitorId: B, rank12: 2, score: 45 },
      { competitorId: C, rank12: 3, score: 39 },
      { competitorId: 'competitor-e', rank12: 4, score: 30 },
    ];
    const { service, save } = buildService([
      storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
    ]);

    await expect(
      service.createRace(dto('2026-08-04T11:05:42Z', otherField)),
    ).resolves.toBeDefined();

    expect(save).toHaveBeenCalledTimes(1);
  });

  describe('clock skew between client and server', () => {
    /**
     * `dto.date` is client-supplied and only validated as ISO-8601, so the two
     * available references can disagree. Neither one alone is safe: rows are
     * stored with client time, but a skewed client anchors its window away
     * from where its own earlier rows landed. The guard therefore checks both
     * windows, and these two tests pin the miss that each single-anchor choice
     * would have produced.
     */
    it('catches a duplicate sitting at server time when the client clock is ahead', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-04T11:05:42Z'));
      try {
        // Client says 14:05 while the server sees 11:05. Anchoring on
        // dto.date alone would scan an empty 14:00 range and miss this.
        const { service, save } = buildService([
          storedRace('race-1', '2026-08-04T11:04:37Z', INCIDENT_RESULTS),
        ]);

        await expect(
          service.createRace(dto('2026-08-04T14:05:42Z', INCIDENT_RESULTS)),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(save).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('catches a duplicate sitting at the skewed client time', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-04T11:05:42Z'));
      try {
        // The mirror image: the earlier row was written by the same skewed
        // client, so it sits at 14:04. Anchoring on server time alone would
        // miss it.
        const { service, save } = buildService([
          storedRace('race-1', '2026-08-04T14:04:37Z', INCIDENT_RESULTS),
        ]);

        await expect(
          service.createRace(dto('2026-08-04T14:05:42Z', INCIDENT_RESULTS)),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(save).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('issues a single query when the clocks broadly agree', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-04T11:06:00Z'));
      try {
        const { service, find } = buildService([]);

        await service.createRace(dto('2026-08-04T11:05:42Z', INCIDENT_RESULTS));

        expect(find).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
