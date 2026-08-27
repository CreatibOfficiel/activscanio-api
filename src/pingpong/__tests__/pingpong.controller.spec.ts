import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongController } from '../pingpong.controller';
import { PingpongPlayersService } from '../services/pingpong-players.service';
import { PingpongMatchService } from '../services/pingpong-match.service';
import { PingpongBestWinService } from '../services/pingpong-best-win.service';
import { PingpongRecomputeService } from '../services/pingpong-recompute.service';
import { ConfigService } from '@nestjs/config';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongEloSnapshot } from '../entities/pingpong-elo-snapshot.entity';

/**
 * The two match endpoints.
 *
 * Both used to return `playerAId` and `playerBId` and nothing else, which
 * forced every caller to fetch the leaderboard as well and join on the id
 * client-side. The tests below pin the fix: one query, relations loaded, both
 * sides named in the response.
 */
describe('PingpongController — matches', () => {
  let controller: PingpongController;
  let matchRepository: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let playersService: { getPlayerByCompetitorId: jest.Mock };

  /** A player row as the relation loader returns it, competitor included. */
  function playerRow(
    id: string,
    firstName: string,
    lastName: string,
  ): Partial<PingpongPlayer> {
    return {
      id,
      competitorId: `comp-${id}`,
      competitor: {
        id: `comp-${id}`,
        firstName,
        lastName,
        profilePictureUrl: `https://cdn.test/${id}.png`,
      } as PingpongPlayer['competitor'],
    };
  }

  function matchRow(overrides: Partial<PingpongMatch> = {}): PingpongMatch {
    return {
      id: 'm1',
      playerAId: 'p1',
      playerBId: 'p2',
      playerA: playerRow('p1', 'Marc', 'Dupont') as PingpongPlayer,
      playerB: playerRow('p2', 'Léa', 'Bernard') as PingpongPlayer,
      winnerId: 'p1',
      sets: [
        { a: 11, b: 7 },
        { a: 11, b: 9 },
      ],
      setsA: 2,
      setsB: 0,
      playedAt: new Date('2026-03-14T12:00:00Z'),
      pairKey: 'p1:p2',
      isoYear: 2026,
      isoWeek: 11,
      appliedWeight: 1,
      ratingFrozen: false,
      ratingABefore: 1608,
      ratingAAfter: 1620,
      rdABefore: 60,
      rdAAfter: 55,
      ratingBBefore: 1540,
      ratingBAfter: 1532,
      rdBBefore: 62,
      rdBAfter: 58,
      createdAt: new Date('2026-03-14T12:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    matchRepository = {
      find: jest.fn().mockResolvedValue([matchRow()]),
      createQueryBuilder: jest.fn(),
    };
    playersService = {
      getPlayerByCompetitorId: jest.fn().mockResolvedValue({ id: 'p1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PingpongController],
      providers: [
        { provide: PingpongPlayersService, useValue: playersService },
        { provide: PingpongMatchService, useValue: {} },
        { provide: PingpongBestWinService, useValue: {} },
        { provide: PingpongRecomputeService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: matchRepository,
        },
        { provide: getRepositoryToken(PingpongEloSnapshot), useValue: {} },
      ],
    }).compile();

    controller = module.get<PingpongController>(PingpongController);
  });

  /** The relations both endpoints must ask the database to load. */
  const expectsRelations = (): object =>
    expect.objectContaining({
      relations: expect.arrayContaining([
        'playerA',
        'playerA.competitor',
        'playerB',
        'playerB.competitor',
      ]),
    }) as object;

  describe('GET /pingpong/matches', () => {
    it('names both players on the match itself', async () => {
      // The whole point of the change. Without the relations these two are
      // undefined and every caller has to fetch the leaderboard to fill them.
      const [match] = await controller.getMatches();

      expect(match.playerA).toEqual(
        expect.objectContaining({ firstName: 'Marc', lastName: 'Dupont' }),
      );
      expect(match.playerB).toEqual(
        expect.objectContaining({ firstName: 'Léa', lastName: 'Bernard' }),
      );
    });

    it('carries the id and the avatar alongside the name', async () => {
      const [match] = await controller.getMatches();

      expect(match.playerA).toEqual({
        id: 'p1',
        competitorId: 'comp-p1',
        firstName: 'Marc',
        lastName: 'Dupont',
        profilePictureUrl: 'https://cdn.test/p1.png',
      });
    });

    it('keeps the flat ids so existing callers still resolve the winner', async () => {
      // `winnerId` is compared against `playerAId` / `playerBId`. Replacing
      // the flat ids with the objects alone would silently break that.
      const [match] = await controller.getMatches();

      expect(match.playerAId).toBe('p1');
      expect(match.playerBId).toBe('p2');
      expect(match.winnerId).toBe('p1');
    });

    it('asks the database for the relations rather than joining later', async () => {
      await controller.getMatches();

      expect(matchRepository.find).toHaveBeenCalledWith(expectsRelations());
    });

    it('loads every match in one query, never one per row', async () => {
      // The N+1 guard. Fifty matches must still be a single find().
      matchRepository.find.mockResolvedValue([
        matchRow({ id: 'm1' }),
        matchRow({ id: 'm2' }),
        matchRow({ id: 'm3' }),
      ]);

      const matches = await controller.getMatches();

      expect(matches).toHaveLength(3);
      expect(matchRepository.find).toHaveBeenCalledTimes(1);
    });

    it('still sorts newest first and caps the page', async () => {
      await controller.getMatches('10');

      expect(matchRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { playedAt: 'DESC' }, take: 10 }),
      );
    });

    it('renders a match whose player row is missing rather than crashing', async () => {
      // RESTRICT makes this hard to reach, but a null relation must degrade
      // to null and never throw on a property of undefined.
      matchRepository.find.mockResolvedValue([
        matchRow({ playerB: null as unknown as PingpongPlayer }),
      ]);

      const [match] = await controller.getMatches();

      expect(match.playerB).toBeNull();
      expect(match.playerA).toEqual(
        expect.objectContaining({ firstName: 'Marc' }),
      );
    });

    it('survives a player row whose competitor is missing', async () => {
      matchRepository.find.mockResolvedValue([
        matchRow({
          playerB: { id: 'p2', competitorId: 'comp-p2' } as PingpongPlayer,
        }),
      ]);

      const [match] = await controller.getMatches();

      expect(match.playerB).toEqual({
        id: 'p2',
        competitorId: 'comp-p2',
        firstName: '',
        lastName: '',
        profilePictureUrl: '',
      });
    });

    it('sends the trimmed player, not the whole rating row', async () => {
      // A match list has no use for rd, vol or streaks, and shipping them
      // makes the payload of a fifty-row page several times larger.
      matchRepository.find.mockResolvedValue([
        matchRow({
          playerA: {
            ...playerRow('p1', 'Marc', 'Dupont'),
            rating: 1620,
            rd: 55,
            vol: 0.06,
            currentStreak: 3,
          } as PingpongPlayer,
        }),
      ]);

      const [match] = await controller.getMatches();

      expect(match.playerA).not.toHaveProperty('rating');
      expect(match.playerA).not.toHaveProperty('rd');
      expect(match.playerA).not.toHaveProperty('currentStreak');
    });
  });

  /**
   * The paginated sibling.
   *
   * A separate endpoint rather than a new shape on `GET /pingpong/matches`,
   * because that one returns a bare array and its callers — including the
   * tests above, which destructure it — would all break on an envelope.
   *
   * The cursor is composite, `playedAt|id`, and that is not decoration.
   * `playedAt` is caller-supplied (`dto.playedAt ?? new Date()`), so an
   * evening's matches keyed in afterwards all share one timestamp. A cursor
   * on the timestamp alone would skip every match tied with the last one on
   * the page.
   */
  describe('GET /pingpong/matches/paginated', () => {
    /** The chainable QueryBuilder keyset pagination needs. */
    function queryBuilderReturning(rows: PingpongMatch[]) {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      matchRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    }

    /**
     * Filtering happens in SQL, not on the page that came back.
     *
     * The history is keyset-paged twenty rows at a time. A client-side
     * filter would only ever narrow the page in hand, so "Marc, this week"
     * over a page holding none of his matches would render an empty list
     * beside a "load more" button — which reads as "he has not played"
     * rather than "keep scrolling".
     */
    describe('filters', () => {
      it('matches a player on either side of the table', async () => {
        const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

        await controller.getMatchesPaginated('20', undefined, 'p1');

        // Both sides, or half of someone's games silently disappear.
        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('playerAId'),
          { playerId: 'p1' },
        );
        expect(qb.andWhere.mock.calls[0][0]).toContain('playerBId');
      });

      it('applies no filter when neither is asked for', async () => {
        const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

        await controller.getMatchesPaginated('20');

        expect(qb.andWhere).not.toHaveBeenCalled();
      });

      it('treats "all" as no date filter', async () => {
        const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

        await controller.getMatchesPaginated('20', undefined, undefined, 'all');

        expect(qb.andWhere).not.toHaveBeenCalled();
      });

      it('bounds the range for a named period', async () => {
        const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

        await controller.getMatchesPaginated(
          '20',
          undefined,
          undefined,
          'week',
        );

        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('playedAt'),
          expect.objectContaining({ dateFrom: expect.any(Date) }),
        );
      });

      it('combines a player and a period', async () => {
        const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

        await controller.getMatchesPaginated('20', undefined, 'p1', 'week');

        expect(qb.andWhere).toHaveBeenCalledTimes(2);
      });
    });

    it('wraps the rows in an envelope rather than returning a bare array', async () => {
      queryBuilderReturning([matchRow({ id: 'm1' })]);

      const page = await controller.getMatchesPaginated('20');

      expect(Array.isArray(page)).toBe(false);
      expect(page.data).toHaveLength(1);
      expect(page.meta).toEqual(
        expect.objectContaining({ hasMore: false, nextCursor: null }),
      );
    });

    it('names both players, exactly as the unpaginated endpoint does', async () => {
      queryBuilderReturning([matchRow({ id: 'm1' })]);

      const page = await controller.getMatchesPaginated('20');

      expect(page.data[0].playerA).toEqual(
        expect.objectContaining({ firstName: 'Marc' }),
      );
      expect(page.data[0].playerB).toEqual(
        expect.objectContaining({ firstName: 'Léa' }),
      );
    });

    /**
     * The over-fetch. Asking for limit+1 is how "is there a next page"
     * is answered without a second COUNT query.
     */
    it('reports hasMore and drops the probe row when a page is full', async () => {
      queryBuilderReturning([
        matchRow({ id: 'm1' }),
        matchRow({ id: 'm2' }),
        matchRow({ id: 'm3' }),
      ]);

      const page = await controller.getMatchesPaginated('2');

      expect(page.data).toHaveLength(2);
      expect(page.meta.hasMore).toBe(true);
    });

    it('takes one more row than the page size, to detect the next page', async () => {
      const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

      await controller.getMatchesPaginated('20');

      expect(qb.take).toHaveBeenCalledWith(21);
    });

    /**
     * The mutation this guards: emit the cursor from the wrong row (the
     * dropped probe, or the first of the page) and page two either skips a
     * match or repeats the whole of page one.
     */
    it('emits a composite cursor built from the last row it kept', async () => {
      queryBuilderReturning([
        matchRow({ id: 'm1', playedAt: new Date('2026-03-14T12:00:00Z') }),
        matchRow({ id: 'm2', playedAt: new Date('2026-03-13T09:00:00Z') }),
        matchRow({ id: 'm3', playedAt: new Date('2026-03-12T08:00:00Z') }),
      ]);

      const page = await controller.getMatchesPaginated('2');

      expect(page.meta.nextCursor).toBe(
        `${new Date('2026-03-13T09:00:00Z').toISOString()}|m2`,
      );
    });

    it('stops paging with a null cursor on the last page', async () => {
      queryBuilderReturning([matchRow({ id: 'm1' })]);

      const page = await controller.getMatchesPaginated('20');

      expect(page.meta.nextCursor).toBeNull();
      expect(page.meta.hasMore).toBe(false);
    });

    /**
     * Keyset, not OFFSET. A tie on `playedAt` must fall through to the id,
     * or the rows sharing the last page's timestamp are skipped entirely.
     */
    it('compares the id as a tiebreak when playedAt is equal', async () => {
      const qb = queryBuilderReturning([matchRow({ id: 'm9' })]);

      await controller.getMatchesPaginated(
        '20',
        `${new Date('2026-03-13T09:00:00Z').toISOString()}|m2`,
      );

      const [sql, params] = qb.andWhere.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(sql).toContain('OR');
      expect(sql).toContain('cursorId');
      expect(params).toEqual(expect.objectContaining({ cursorId: 'm2' }));
    });

    it('asks for no cursor filter on the first page', async () => {
      const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

      await controller.getMatchesPaginated('20');

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('orders newest first, with the id breaking ties', async () => {
      const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

      await controller.getMatchesPaginated('20');

      expect(qb.orderBy).toHaveBeenCalledWith('m.playedAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('m.id', 'DESC');
    });

    /**
     * The page size is still bounded. The point of the change is to remove
     * the ceiling on the HISTORY, not to let one request ask for all of it.
     */
    it('caps an oversized page size', async () => {
      const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

      await controller.getMatchesPaginated('5000');

      expect(qb.take).toHaveBeenCalledWith(101);
    });

    it('falls back to a sane page size when the limit is junk', async () => {
      const qb = queryBuilderReturning([matchRow({ id: 'm1' })]);

      await controller.getMatchesPaginated('not-a-number');

      expect(qb.take).toHaveBeenCalledWith(21);
    });

    it('returns an empty page rather than throwing when nothing matches', async () => {
      queryBuilderReturning([]);

      const page = await controller.getMatchesPaginated('20');

      expect(page.data).toEqual([]);
      expect(page.meta.hasMore).toBe(false);
      expect(page.meta.nextCursor).toBeNull();
    });
  });

  describe('GET /pingpong/players/:competitorId/matches', () => {
    it('names both players too', async () => {
      // Same problem, same fix — the profile page reads this one.
      const [match] = await controller.getPlayerMatches('comp-p1');

      expect(match.playerA).toEqual(
        expect.objectContaining({ firstName: 'Marc' }),
      );
      expect(match.playerB).toEqual(
        expect.objectContaining({ firstName: 'Léa' }),
      );
    });

    it('asks the database for the relations', async () => {
      await controller.getPlayerMatches('comp-p1');

      expect(matchRepository.find).toHaveBeenCalledWith(expectsRelations());
    });

    it('loads the page in one query', async () => {
      matchRepository.find.mockResolvedValue([
        matchRow({ id: 'm1' }),
        matchRow({ id: 'm2' }),
      ]);

      await controller.getPlayerMatches('comp-p1');

      expect(matchRepository.find).toHaveBeenCalledTimes(1);
    });

    it('still filters on both sides of the table', async () => {
      await controller.getPlayerMatches('comp-p1');

      expect(matchRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ playerAId: 'p1' }, { playerBId: 'p1' }],
          order: { playedAt: 'DESC' },
          take: 50,
        }),
      );
    });
  });
});
