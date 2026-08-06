import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PingpongRecomputeService } from '../pingpong-recompute.service';
import { PingpongRatingService } from '../pingpong-rating.service';
import { PingpongMatch } from '../../entities/pingpong-match.entity';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { buildPairKey } from '../../utils/pairing-weight';

/**
 * Historical recompute: replay every match from defaults through the live
 * rating path, and rewrite both the players and the match audit trail.
 *
 * This exists because removing the rating freeze changed the maths for
 * matches already recorded. Without a replay, the leaderboard keeps carrying
 * ratings produced by a rule that no longer exists, and the stored
 * before/after columns on each match contradict it.
 *
 * The tests below drive the service against an in-memory fake of the
 * transactional manager, because every guarantee that matters here — order,
 * weighting, idempotence, atomicity — is observable at that boundary.
 */
describe('PingpongRecomputeService', () => {
  let service: PingpongRecomputeService;
  let manager: {
    find: jest.Mock;
    save: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: typeof manager;
  };

  /** Rows the fake manager hands back, and that saves are applied against. */
  let storedPlayers: PingpongPlayer[];
  let storedMatches: PingpongMatch[];

  const ALICE = 'aaaa';
  const BOB = 'bbbb';
  const CAROL = 'cccc';

  function makePlayer(id: string, over: Partial<PingpongPlayer> = {}) {
    return {
      id,
      competitorId: `comp-${id}`,
      // Deliberately dirty: whatever the recompute starts from, it must reset
      // these to the defaults before replaying. A service that forgets the
      // reset would silently accumulate on top of the old numbers.
      rating: 1234,
      rd: 77,
      vol: 0.09,
      matchCount: 99,
      weightedMatchCount: 99,
      wins: 99,
      losses: 99,
      setsWon: 99,
      setsLost: 99,
      currentStreak: 99,
      bestStreak: 99,
      lastMatchAt: new Date('2020-01-01T00:00:00Z'),
      lastDecayAt: null,
      isRankingEligible: false,
      distinctOpponents21d: 0,
      diversityScore21d: 0,
      previousDayRank: null,
      ...over,
    } as PingpongPlayer;
  }

  /** A 2-0 win for whoever `winner` names, on a given date. */
  function makeMatch(
    id: string,
    playerAId: string,
    playerBId: string,
    winner: 'A' | 'B',
    playedAt: string,
    over: Partial<PingpongMatch> = {},
  ) {
    const date = new Date(playedAt);
    return {
      id,
      playerAId,
      playerBId,
      winnerId: winner === 'A' ? playerAId : playerBId,
      sets:
        winner === 'A'
          ? [
              { a: 11, b: 5 },
              { a: 11, b: 3 },
            ]
          : [
              { a: 5, b: 11 },
              { a: 3, b: 11 },
            ],
      setsA: winner === 'A' ? 2 : 0,
      setsB: winner === 'A' ? 0 : 2,
      playedAt: date,
      pairKey: buildPairKey(playerAId, playerBId),
      isoYear: 2026,
      isoWeek: 32,
      // Stale values from the old rule. The recompute must overwrite every
      // one of these rather than trusting them.
      appliedWeight: 1,
      ratingFrozen: true,
      ratingABefore: 0,
      ratingAAfter: 0,
      rdABefore: 0,
      rdAAfter: 0,
      ratingBBefore: 0,
      ratingBAfter: 0,
      rdBBefore: 0,
      rdBAfter: 0,
      ...over,
    } as PingpongMatch;
  }

  /** The match rows handed to save(PingpongMatch, row), typed. */
  function savedMatches(): PingpongMatch[] {
    const calls = manager.save.mock.calls as [unknown, unknown][];
    return calls
      .filter(([entity]) => entity === PingpongMatch)
      .map(([, row]) => row as PingpongMatch);
  }

  function setup(players: PingpongPlayer[], matches: PingpongMatch[]) {
    storedPlayers = players;
    storedMatches = matches;

    manager.find.mockImplementation((entity: unknown) => {
      if (entity === PingpongPlayer) return Promise.resolve(storedPlayers);
      if (entity === PingpongMatch) return Promise.resolve(storedMatches);
      return Promise.resolve([]);
    });
  }

  beforeEach(async () => {
    manager = {
      find: jest.fn().mockResolvedValue([]),
      save: jest
        .fn()
        .mockImplementation((_e: unknown, data: unknown) =>
          Promise.resolve(data),
        ),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongRecomputeService,
        PingpongRatingService,
        {
          provide: DataSource,
          useValue: { createQueryRunner: () => queryRunner },
        },
      ],
    }).compile();

    service = module.get(PingpongRecomputeService);
  });

  describe('reset to defaults', () => {
    it('resets a player with no matches back to 1500 / 350 / 0.06', async () => {
      setup([makePlayer(ALICE)], []);

      const report = await service.recompute();

      const alice = report.players.find((p) => p.playerId === ALICE);
      expect(alice?.after.rating).toBe(1500);
      expect(alice?.after.rd).toBe(350);
      expect(alice?.after.vol).toBe(0.06);
    });

    it('zeroes every counter for a player with no matches', async () => {
      setup([makePlayer(ALICE)], []);

      const report = await service.recompute();
      const alice = report.players.find((p) => p.playerId === ALICE);

      expect(alice?.after.matchCount).toBe(0);
      expect(alice?.after.weightedMatchCount).toBe(0);
      expect(alice?.after.wins).toBe(0);
      expect(alice?.after.losses).toBe(0);
      expect(alice?.after.setsWon).toBe(0);
      expect(alice?.after.setsLost).toBe(0);
      expect(alice?.after.currentStreak).toBe(0);
      expect(alice?.after.bestStreak).toBe(0);
      expect(alice?.after.lastMatchAt).toBeNull();
    });

    it('reports the before state alongside the after state', async () => {
      setup([makePlayer(ALICE, { rating: 1234 })], []);

      const report = await service.recompute();
      const alice = report.players.find((p) => p.playerId === ALICE);

      expect(alice?.before.rating).toBe(1234);
      expect(alice?.after.rating).toBe(1500);
    });
  });

  describe('replay reproduces the live path', () => {
    it('produces exactly what the rating service produces for one match', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z')],
      );

      const report = await service.recompute();

      // Same engine, same inputs, from defaults.
      const rating = new PingpongRatingService();
      const expected = rating.calculateMatchRating({
        playerA: { rating: 1500, rd: 350, vol: 0.06 },
        playerB: { rating: 1500, rd: 350, vol: 0.06 },
        winner: 'A',
        weight: 1,
      });

      const alice = report.players.find((p) => p.playerId === ALICE);
      const bob = report.players.find((p) => p.playerId === BOB);

      expect(alice?.after.rating).toBeCloseTo(expected.playerA.rating, 9);
      expect(alice?.after.rd).toBeCloseTo(expected.playerA.rd, 9);
      expect(bob?.after.rating).toBeCloseTo(expected.playerB.rating, 9);
    });

    it('replays in playedAt order regardless of the order rows arrive in', async () => {
      // Two matches whose outcome depends on sequence: Alice beats Bob, then
      // Bob beats Alice. Replayed backwards the final ratings differ, because
      // each step's rd feeds the next.
      const chronological = [
        makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
        makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z'),
      ];

      setup([makePlayer(ALICE), makePlayer(BOB)], chronological);
      const forward = await service.recompute();
      const forwardAlice = forward.players.find((p) => p.playerId === ALICE)
        ?.after.rating;

      // Same rows, shuffled. The service must sort them itself.
      setup([makePlayer(ALICE), makePlayer(BOB)], [...chronological].reverse());
      const shuffled = await service.recompute();
      const shuffledAlice = shuffled.players.find((p) => p.playerId === ALICE)
        ?.after.rating;

      expect(shuffledAlice).toBeCloseTo(forwardAlice as number, 9);
    });

    it('replays oldest first, not newest first', async () => {
      // Direction, not just determinism. A comparator sorting descending is
      // stable and idempotent and would satisfy the shuffle test above, while
      // replaying the league backwards — so pin the direction directly.
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
          makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z'),
          makeMatch('m3', ALICE, BOB, 'A', '2026-08-05T12:00:00Z'),
        ],
      );

      const report = await service.recompute();

      // The report lists matches in the order they were replayed.
      expect(report.matches.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      expect(report.matches.map((m) => m.playedAt.toISOString())).toEqual([
        '2026-08-03T12:00:00.000Z',
        '2026-08-04T12:00:00.000Z',
        '2026-08-05T12:00:00.000Z',
      ]);

      // And the first replayed match must start from the defaults, which is
      // only true if the oldest went first.
      expect(report.matches[0].ratingABefore).toBe(1500);
      expect(report.matches[0].rdABefore).toBe(350);
    });

    it('breaks playedAt ties deterministically so a replay is reproducible', async () => {
      // Matches keyed in after the fact share one timestamp. Sorting on the
      // timestamp alone leaves their relative order to the storage engine,
      // and a recompute that is not deterministic is not idempotent either.
      const sameInstant = '2026-08-03T12:00:00Z';
      const rows = [
        makeMatch('m1', ALICE, BOB, 'A', sameInstant),
        makeMatch('m2', ALICE, BOB, 'B', sameInstant),
        makeMatch('m3', ALICE, BOB, 'A', sameInstant),
      ];

      setup([makePlayer(ALICE), makePlayer(BOB)], rows);
      const first = await service.recompute();

      setup([makePlayer(ALICE), makePlayer(BOB)], [...rows].reverse());
      const second = await service.recompute();

      expect(
        second.players.find((p) => p.playerId === ALICE)?.after.rating,
      ).toBeCloseTo(
        first.players.find((p) => p.playerId === ALICE)?.after.rating as number,
        9,
      );
    });

    it('rebuilds wins, losses, sets and streaks from the replayed matches', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
          makeMatch('m2', ALICE, BOB, 'A', '2026-08-04T12:00:00Z'),
          makeMatch('m3', ALICE, BOB, 'B', '2026-08-05T12:00:00Z'),
        ],
      );

      const report = await service.recompute();
      const alice = report.players.find((p) => p.playerId === ALICE)?.after;
      const bob = report.players.find((p) => p.playerId === BOB)?.after;

      expect(alice?.matchCount).toBe(3);
      expect(alice?.wins).toBe(2);
      expect(alice?.losses).toBe(1);
      expect(alice?.setsWon).toBe(4);
      expect(alice?.setsLost).toBe(2);
      // Won, won, lost — the run is broken but the best is remembered.
      expect(alice?.currentStreak).toBe(0);
      expect(alice?.bestStreak).toBe(2);

      expect(bob?.wins).toBe(1);
      expect(bob?.losses).toBe(2);
      expect(bob?.currentStreak).toBe(1);
      expect(bob?.lastMatchAt).toEqual(new Date('2026-08-05T12:00:00Z'));
    });
  });

  /**
   * The per-ISO-week pairing weight is gone, so every replayed match counts
   * fully. These tests pin that, because the old rule is exactly the sort of
   * thing that gets reintroduced by someone reading the surviving
   * `appliedWeight` / `pairKey` / `isoWeek` columns and inferring a rule from
   * them.
   */
  describe('every replayed match counts fully', () => {
    /** n matches between the same pair, all inside one ISO week. */
    function sameWeekRun(count: number) {
      return Array.from({ length: count }, (_, i) =>
        makeMatch(
          `m${i}`,
          ALICE,
          BOB,
          'A',
          // 3 to 7 August 2026 all fall in ISO week 32.
          `2026-08-0${3 + (i % 5)}T${String(8 + i).padStart(2, '0')}:00:00Z`,
        ),
      );
    }

    it('weighs a pair’s seventh meeting in one week the same as its first', async () => {
      // Under the old rule this ran 1, 1, 1, 0.5, 0.5, 0.5, 0.
      setup([makePlayer(ALICE), makePlayer(BOB)], sameWeekRun(7));

      const report = await service.recompute();

      expect(report.matches.map((m) => m.appliedWeight)).toEqual([
        1, 1, 1, 1, 1, 1, 1,
      ]);
    });

    it('moves the rating on every match, including the seventh of a week', async () => {
      // The old rule discarded this one outright.
      setup([makePlayer(ALICE), makePlayer(BOB)], sameWeekRun(7));

      const report = await service.recompute();

      for (const m of report.matches) {
        expect(m.ratingAAfter).not.toBe(m.ratingABefore);
        expect(m.ratingBAfter).not.toBe(m.ratingBBefore);
      }
    });

    it('keeps the weighted count equal to the raw count', async () => {
      setup([makePlayer(ALICE), makePlayer(BOB)], sameWeekRun(7));

      const report = await service.recompute();
      const alice = report.players.find((p) => p.playerId === ALICE)?.after;

      expect(alice?.matchCount).toBe(7);
      // Was 4.5 under the pairing rule.
      expect(alice?.weightedMatchCount).toBe(7);
    });

    it('overwrites a stored weight that disagrees', async () => {
      // Rows written under the old rule carry 0.5 and 0. The recompute must
      // not carry those forward.
      const rows = sameWeekRun(3).map((m, i) => ({
        ...m,
        appliedWeight: [1, 0.5, 0][i],
      }));
      setup([makePlayer(ALICE), makePlayer(BOB)], rows);

      const report = await service.recompute();

      expect(report.matches.map((m) => m.appliedWeight)).toEqual([1, 1, 1]);
    });

    it('still records the pair key and ISO week for the historical record', async () => {
      // The columns survive even though nothing reads them for weighting:
      // head-to-head uses the pair key, and deleting them would destroy the
      // record of what the old rule applied.
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', BOB, ALICE, 'A', '2026-08-03T12:00:00Z')],
      );

      await service.recompute();

      const saved = savedMatches()[0];

      expect(saved.pairKey).toBe(buildPairKey(ALICE, BOB));
      expect(saved.isoYear).toBe(2026);
      expect(saved.isoWeek).toBe(32);
    });

    it('realigns a stored ISO week that disagrees with playedAt', async () => {
      // Every fixture row claims week 32; this one is actually week 33.
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-10T12:00:00Z')],
      );

      await service.recompute();

      const saved = savedMatches()[0];

      expect(saved.isoWeek).toBe(33);
    });
  });

  describe('the bug this recompute exists to fix', () => {
    it('lets an underdog gain rating after winning across a 442 point gap', async () => {
      // Reproduces the production case: a long run of one-sided results opens
      // a gap wider than the old 250-point freeze, then the underdog wins.
      // Under the freeze that final match moved nothing at all.
      const rows = [
        // Bob builds a lead over Carol across several weeks.
        makeMatch('w1', BOB, CAROL, 'A', '2026-06-01T12:00:00Z'),
        makeMatch('w2', BOB, CAROL, 'A', '2026-06-08T12:00:00Z'),
        makeMatch('w3', BOB, CAROL, 'A', '2026-06-15T12:00:00Z'),
        makeMatch('w4', BOB, CAROL, 'A', '2026-06-22T12:00:00Z'),
        makeMatch('w5', BOB, CAROL, 'A', '2026-06-29T12:00:00Z'),
        makeMatch('w6', BOB, CAROL, 'A', '2026-07-06T12:00:00Z'),
      ];

      setup([makePlayer(BOB), makePlayer(CAROL)], rows);
      const beforeUpset = await service.recompute();
      const carolBefore = beforeUpset.players.find((p) => p.playerId === CAROL)
        ?.after.rating as number;
      const bobBefore = beforeUpset.players.find((p) => p.playerId === BOB)
        ?.after.rating as number;

      // A real gap has opened.
      expect(bobBefore - carolBefore).toBeGreaterThan(250);

      // Now Carol takes one, in a fresh week so the weight is full.
      setup(
        [makePlayer(BOB), makePlayer(CAROL)],
        [...rows, makeMatch('upset', BOB, CAROL, 'B', '2026-07-13T12:00:00Z')],
      );
      const afterUpset = await service.recompute();
      const carolAfter = afterUpset.players.find((p) => p.playerId === CAROL)
        ?.after.rating as number;

      // The whole point: the upset must be worth something.
      expect(carolAfter).toBeGreaterThan(carolBefore);

      const upsetRow = afterUpset.matches.find((m) => m.id === 'upset');
      expect(upsetRow?.ratingBAfter).toBeGreaterThan(
        upsetRow?.ratingBBefore as number,
      );
    });

    it('clears ratingFrozen on every recomputed match', async () => {
      // The rows arrive with ratingFrozen true, written under the old rule.
      // The column survives as history, but a recomputed row was not frozen.
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z', {
            ratingFrozen: true,
          }),
          makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z', {
            ratingFrozen: true,
          }),
        ],
      );

      const report = await service.recompute();

      for (const m of report.matches) {
        expect(m.ratingFrozen).toBe(false);
      }
    });
  });

  describe('audit trail stays consistent with the players', () => {
    it('chains each match before-state onto the previous after-state', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
          makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z'),
        ],
      );

      const report = await service.recompute();
      const [first, second] = report.matches;

      expect(first.ratingABefore).toBe(1500);
      expect(second.ratingABefore).toBeCloseTo(first.ratingAAfter, 9);
      expect(second.rdABefore).toBeCloseTo(first.rdAAfter, 9);
      expect(second.ratingBBefore).toBeCloseTo(first.ratingBAfter, 9);
      expect(second.rdBBefore).toBeCloseTo(first.rdBAfter, 9);
    });

    it('ends the last match on the same numbers the player carries', async () => {
      // The failure this guards against is the visible one: a match list whose
      // final row disagrees with the leaderboard.
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
          makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z'),
        ],
      );

      const report = await service.recompute();
      const last = report.matches[report.matches.length - 1];
      const alice = report.players.find((p) => p.playerId === ALICE)?.after;
      const bob = report.players.find((p) => p.playerId === BOB)?.after;

      expect(alice?.rating).toBeCloseTo(last.ratingAAfter, 9);
      expect(alice?.rd).toBeCloseTo(last.rdAAfter, 9);
      expect(bob?.rating).toBeCloseTo(last.ratingBAfter, 9);
      expect(bob?.rd).toBeCloseTo(last.rdBAfter, 9);
    });

    it('writes the recomputed match rows back', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z')],
      );

      await service.recompute();

      expect(savedMatches()).toHaveLength(1);
      expect(savedMatches()[0].id).toBe('m1');
    });
  });

  describe('idempotence', () => {
    it('gives the same result when run twice over the same data', async () => {
      const players = [makePlayer(ALICE), makePlayer(BOB), makePlayer(CAROL)];
      const matches = [
        makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T09:00:00Z'),
        makeMatch('m2', ALICE, BOB, 'B', '2026-08-03T10:00:00Z'),
        makeMatch('m3', ALICE, CAROL, 'A', '2026-08-04T09:00:00Z'),
        makeMatch('m4', ALICE, BOB, 'A', '2026-08-04T10:00:00Z'),
        makeMatch('m5', ALICE, BOB, 'A', '2026-08-05T10:00:00Z'),
      ];

      setup(players, matches);
      const first = await service.recompute();

      // Second run starts from the state the first produced, which is what a
      // real second invocation would see.
      const carried = first.players.map((p) =>
        makePlayer(p.playerId, {
          rating: p.after.rating,
          rd: p.after.rd,
          vol: p.after.vol,
          matchCount: p.after.matchCount,
          weightedMatchCount: p.after.weightedMatchCount,
          wins: p.after.wins,
          losses: p.after.losses,
          setsWon: p.after.setsWon,
          setsLost: p.after.setsLost,
          currentStreak: p.after.currentStreak,
          bestStreak: p.after.bestStreak,
          lastMatchAt: p.after.lastMatchAt,
        }),
      );
      setup(carried, matches);
      const second = await service.recompute();

      for (const p of first.players) {
        const again = second.players.find((q) => q.playerId === p.playerId);
        expect(again?.after.rating).toBeCloseTo(p.after.rating, 9);
        expect(again?.after.rd).toBeCloseTo(p.after.rd, 9);
        expect(again?.after.vol).toBeCloseTo(p.after.vol, 9);
        expect(again?.after.matchCount).toBe(p.after.matchCount);
        expect(again?.after.weightedMatchCount).toBeCloseTo(
          p.after.weightedMatchCount,
          9,
        );
        expect(again?.after.wins).toBe(p.after.wins);
        expect(again?.after.losses).toBe(p.after.losses);
        expect(again?.after.bestStreak).toBe(p.after.bestStreak);
      }

      for (const m of first.matches) {
        const again = second.matches.find((n) => n.id === m.id);
        expect(again?.appliedWeight).toBe(m.appliedWeight);
        expect(again?.ratingAAfter).toBeCloseTo(m.ratingAAfter, 9);
        expect(again?.ratingBAfter).toBeCloseTo(m.ratingBAfter, 9);
      }
    });
  });

  describe('transaction', () => {
    it('commits once the whole replay succeeds', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z')],
      );

      await service.recompute();

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('rolls back when a write fails midway', async () => {
      // A half-replayed league is worse than the state we started from.
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
          makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z'),
        ],
      );
      manager.save.mockRejectedValueOnce(new Error('db down'));

      await expect(service.recompute()).rejects.toThrow('db down');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('releases the runner even when the read fails', async () => {
      manager.find.mockRejectedValueOnce(new Error('read failed'));

      await expect(service.recompute()).rejects.toThrow('read failed');

      expect(queryRunner.release).toHaveBeenCalled();
    });
  });

  describe('dry run', () => {
    it('writes nothing but still reports the full before/after', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z')],
      );

      const report = await service.recompute({ dryRun: true });

      expect(manager.save).not.toHaveBeenCalled();
      expect(report.dryRun).toBe(true);
      expect(report.players).toHaveLength(2);
      expect(report.matches).toHaveLength(1);
      expect(
        report.players.find((p) => p.playerId === ALICE)?.after.rating,
      ).toBeGreaterThan(1500);
    });

    it('rolls back rather than commits', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z')],
      );

      await service.recompute({ dryRun: true });

      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('computes the same numbers a real run would', async () => {
      const players = [makePlayer(ALICE), makePlayer(BOB)];
      const matches = [
        makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
        makeMatch('m2', ALICE, BOB, 'B', '2026-08-04T12:00:00Z'),
      ];

      setup(players, matches);
      const dry = await service.recompute({ dryRun: true });

      setup([makePlayer(ALICE), makePlayer(BOB)], matches);
      const wet = await service.recompute();

      expect(
        dry.players.find((p) => p.playerId === ALICE)?.after.rating,
      ).toBeCloseTo(
        wet.players.find((p) => p.playerId === ALICE)?.after.rating as number,
        9,
      );
    });
  });

  describe('report summary', () => {
    it('counts the players and matches it touched', async () => {
      setup(
        [makePlayer(ALICE), makePlayer(BOB), makePlayer(CAROL)],
        [
          makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z'),
          makeMatch('m2', ALICE, CAROL, 'A', '2026-08-04T12:00:00Z'),
        ],
      );

      const report = await service.recompute();

      expect(report.playersRecomputed).toBe(3);
      expect(report.matchesReplayed).toBe(2);
    });

    it('reports the rating delta for each player', async () => {
      setup(
        [makePlayer(ALICE, { rating: 1000 }), makePlayer(BOB)],
        [makeMatch('m1', ALICE, BOB, 'A', '2026-08-03T12:00:00Z')],
      );

      const report = await service.recompute();
      const alice = report.players.find((p) => p.playerId === ALICE);

      expect(alice?.delta).toBeCloseTo(
        (alice?.after.rating as number) - 1000,
        9,
      );
    });
  });
});
