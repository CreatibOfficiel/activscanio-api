import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongController } from '../pingpong.controller';
import { PingpongPlayersService } from '../services/pingpong-players.service';
import { PingpongMatchService } from '../services/pingpong-match.service';
import { PingpongBestWinService } from '../services/pingpong-best-win.service';
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
  let matchRepository: { find: jest.Mock };
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
    } as PingpongMatch;
  }

  beforeEach(async () => {
    matchRepository = { find: jest.fn().mockResolvedValue([matchRow()]) };
    playersService = {
      getPlayerByCompetitorId: jest.fn().mockResolvedValue({ id: 'p1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PingpongController],
      providers: [
        { provide: PingpongPlayersService, useValue: playersService },
        { provide: PingpongMatchService, useValue: {} },
        { provide: PingpongBestWinService, useValue: {} },
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
      ]) as unknown as string[],
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
