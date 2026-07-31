/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceBestWinService } from '../services/race-best-win.service';
import { RaceResult } from '../race-result.entity';
import { RaceEvent } from '../race-event.entity';

/**
 * Highest-rated opponent ever finished ahead of, in a race.
 *
 * The ping-pong version of this metric reads a single `winnerId`. A race has
 * up to twelve finishers and no winner column from a given player's point of
 * view, so "beating" someone means finishing ahead of them: a strictly lower
 * `rank12`. Third place still beats the eight people behind it, which is what
 * makes the metric reachable for a mid-pack player.
 *
 * `ratingBefore` was added by migration 1773100000000 with no backfill, so
 * every race recorded before it carries NULL. A null is missing data, never a
 * zero, and must never become the record.
 */
describe('RaceBestWinService', () => {
  let service: RaceBestWinService;
  let resultRepository: Repository<RaceResult>;

  const PLAYER = 'me';

  interface Finisher {
    competitorId: string;
    rank12: number;
    ratingBefore?: number | null;
  }

  /** One race, described by its finishing order. */
  function race(
    finishers: Finisher[],
    { id = 'race-1', date = new Date('2026-01-01') } = {},
  ): RaceResult[] {
    const event = { id, date } as RaceEvent;

    const results = finishers.map((f, index) => ({
      id: `${id}-${index}`,
      competitorId: f.competitorId,
      rank12: f.rank12,
      score: 0,
      ratingBefore: f.ratingBefore === undefined ? 1500 : f.ratingBefore,
      ratingAfter: 1500,
      race: event,
    })) as unknown as RaceResult[];

    // The service reads the rest of the field through `race.results`, the
    // same shape TypeORM hydrates from `relations: ['race', 'race.results']`.
    event.results = results;
    return results;
  }

  async function buildService(results: RaceResult[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RaceBestWinService,
        {
          provide: getRepositoryToken(RaceResult),
          useValue: {
            // The real query filters on `competitorId`; the mock does the
            // same so the service is handed only the player's own rows, as
            // it would be in production.
            find: jest
              .fn()
              .mockImplementation(
                (options?: { where?: { competitorId?: string } }) =>
                  Promise.resolve(
                    results.filter(
                      (r) => r.competitorId === options?.where?.competitorId,
                    ),
                  ),
              ),
          },
        },
      ],
    }).compile();

    service = module.get(RaceBestWinService);
    resultRepository = module.get(getRepositoryToken(RaceResult));
  }

  it('returns null for a competitor who has never raced', async () => {
    // Not 0 — "0" reads as having beaten someone rated zero.
    await buildService([]);
    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('counts finishing ahead of someone in a multi-player race', async () => {
    // The core rule. Our player came 2nd of 4 and so beat the two behind.
    await buildService(
      race([
        { competitorId: 'winner', rank12: 1, ratingBefore: 1900 },
        { competitorId: PLAYER, rank12: 2, ratingBefore: 1500 },
        { competitorId: 'third', rank12: 3, ratingBefore: 1700 },
        { competitorId: 'fourth', rank12: 4, ratingBefore: 1600 },
      ]),
    );

    const best = await service.computeFor(PLAYER);
    // 1700 is the strongest of the two beaten. The 1900 finished AHEAD, so
    // it is not a win and must not be the record.
    expect(best?.opponentRating).toBe(1700);
    expect(best?.opponentId).toBe('third');
  });

  it('does not count opponents who finished ahead', async () => {
    await buildService(
      race([
        { competitorId: 'ahead', rank12: 1, ratingBefore: 2000 },
        { competitorId: PLAYER, rank12: 2, ratingBefore: 1500 },
      ]),
    );

    // Nobody was beaten, so there is no record — not the 2000 they lost to.
    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('returns null for a competitor who finished last every time', async () => {
    await buildService([
      ...race(
        [
          { competitorId: 'a', rank12: 1, ratingBefore: 1800 },
          { competitorId: PLAYER, rank12: 2, ratingBefore: 1400 },
        ],
        { id: 'r1' },
      ),
      ...race(
        [
          { competitorId: 'b', rank12: 1, ratingBefore: 1750 },
          { competitorId: PLAYER, rank12: 2, ratingBefore: 1400 },
        ],
        { id: 'r2' },
      ),
    ]);

    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('reads the opponent rating from BEFORE the race', async () => {
    // After the race the beaten opponent has already lost points, which
    // would understate the feat.
    const results = race([
      { competitorId: PLAYER, rank12: 1, ratingBefore: 1500 },
      { competitorId: 'beaten', rank12: 2, ratingBefore: 1800 },
    ]);
    // Make `ratingAfter` clearly different, so reading the wrong column shows.
    results[1].ratingAfter = 1740;
    await buildService(results);

    expect((await service.computeFor(PLAYER))?.opponentRating).toBe(1800);
  });

  it('skips opponents whose rating was never recorded', async () => {
    // Pre-migration rows carry NULL. Skipped, never read as zero.
    await buildService(
      race([
        { competitorId: PLAYER, rank12: 1 },
        { competitorId: 'unrated', rank12: 2, ratingBefore: null },
        { competitorId: 'rated', rank12: 3, ratingBefore: 1620 },
      ]),
    );

    const best = await service.computeFor(PLAYER);
    expect(best?.opponentRating).toBe(1620);
    expect(best?.opponentId).toBe('rated');
  });

  it('returns null when every beaten opponent is unrated', async () => {
    // A competitor whose whole history predates the migration has no record
    // yet. That is honest; a 0 would not be.
    await buildService(
      race([
        { competitorId: PLAYER, rank12: 1 },
        { competitorId: 'x', rank12: 2, ratingBefore: null },
        { competitorId: 'y', rank12: 3, ratingBefore: null },
      ]),
    );

    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('skips a race where the player own result carries no rank', async () => {
    await buildService(
      race([
        { competitorId: PLAYER, rank12: null as unknown as number },
        { competitorId: 'other', rank12: 2, ratingBefore: 1700 },
      ]),
    );

    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('keeps the highest rating beaten across races, not the most recent', async () => {
    await buildService([
      ...race(
        [
          { competitorId: PLAYER, rank12: 1, ratingBefore: 1500 },
          { competitorId: 'strong', rank12: 2, ratingBefore: 1820 },
        ],
        { id: 'r1', date: new Date('2026-01-01') },
      ),
      ...race(
        [
          { competitorId: PLAYER, rank12: 1, ratingBefore: 1500 },
          { competitorId: 'weak', rank12: 2, ratingBefore: 1200 },
        ],
        { id: 'r2', date: new Date('2026-06-01') },
      ),
    ]);

    const best = await service.computeFor(PLAYER);
    expect(best?.opponentRating).toBe(1820);
    expect(best?.opponentId).toBe('strong');
  });

  it('is not lowered by a later race the player finished last in', async () => {
    // Monotonicity: the reason this metric is shown instead of a peak rating.
    await buildService([
      ...race(
        [
          { competitorId: PLAYER, rank12: 1, ratingBefore: 1500 },
          { competitorId: 'strong', rank12: 2, ratingBefore: 1820 },
        ],
        { id: 'r1' },
      ),
      ...race(
        [
          { competitorId: 'a', rank12: 1, ratingBefore: 1900 },
          { competitorId: 'b', rank12: 2, ratingBefore: 1880 },
          { competitorId: PLAYER, rank12: 3, ratingBefore: 1400 },
        ],
        { id: 'r2' },
      ),
    ]);

    expect((await service.computeFor(PLAYER))?.opponentRating).toBe(1820);
  });

  it('reports the date of the race that set the record', async () => {
    await buildService([
      ...race(
        [
          { competitorId: PLAYER, rank12: 1, ratingBefore: 1500 },
          { competitorId: 'strong', rank12: 2, ratingBefore: 1820 },
        ],
        { id: 'r1', date: new Date('2026-02-14') },
      ),
      ...race(
        [
          { competitorId: PLAYER, rank12: 1, ratingBefore: 1500 },
          { competitorId: 'weak', rank12: 2, ratingBefore: 1100 },
        ],
        { id: 'r2', date: new Date('2026-07-20') },
      ),
    ]);

    const best = await service.computeFor(PLAYER);
    expect(best?.raceDate).toEqual(new Date('2026-02-14'));
    expect(best?.raceId).toBe('r1');
    // The player's own finishing position in that race, for the copy.
    expect(best?.rank12).toBe(1);
  });

  it('does not treat a tie as a win', async () => {
    // Equal rank is not "ahead". Counting it would award a record for a
    // dead heat, and `<` vs `<=` is exactly the kind of slip this catches.
    await buildService(
      race([
        { competitorId: PLAYER, rank12: 2, ratingBefore: 1500 },
        { competitorId: 'tied', rank12: 2, ratingBefore: 1900 },
      ]),
    );

    expect(await service.computeFor(PLAYER)).toBeNull();
  });

  it('ignores the player own row when looking for opponents', async () => {
    // A competitor can appear twice across a race pair; more to the point, a
    // player must never count as their own victim. The player's own rating
    // here (1900) is the highest in the field and sits at the best rank, so
    // dropping the identity check would report the player beating themselves
    // for 1900 instead of the 1600 they actually beat.
    await buildService(
      race([
        { competitorId: PLAYER, rank12: 1, ratingBefore: 1900 },
        { competitorId: 'beaten', rank12: 2, ratingBefore: 1600 },
      ]),
    );

    const best = await service.computeFor(PLAYER);
    expect(best?.opponentId).toBe('beaten');
    expect(best?.opponentRating).toBe(1600);
  });

  it('asks the database only for races this competitor took part in', async () => {
    await buildService([]);
    await service.computeFor(PLAYER);

    const call = jest.mocked(resultRepository.find).mock.calls[0][0];
    expect(call?.where).toBeDefined();
    expect(JSON.stringify(call?.where)).toContain(PLAYER);
  });
});
