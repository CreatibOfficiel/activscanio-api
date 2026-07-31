/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayersService } from '../pingpong-players.service';
import { PingpongRatingService } from '../pingpong-rating.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { PingpongMatch } from '../../entities/pingpong-match.entity';
import { Competitor } from '../../../competitors/competitor.entity';

/**
 * Enrolling someone into ping-pong.
 *
 * The match entry form lists every competitor in the office, not only those
 * already enrolled — a leaderboard that starts empty and offers no way in is
 * a dead end, and asking people to find a separate "join ping-pong" button
 * before their first match is a step nobody would discover.
 *
 * So recording a first match must enrol on the fly. `enrol` rejects a
 * duplicate with a 409, which is right for an explicit call and wrong as a
 * building block, hence `ensureEnrolled`.
 */
describe('PingpongPlayersService — enrolment', () => {
  let service: PingpongPlayersService;
  let playerRepository: Repository<PingpongPlayer>;
  let competitorRepository: Repository<Competitor>;

  const COMPETITOR_ID = 'comp-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongPlayersService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((data: unknown) => data),
            save: jest.fn((data: object) => ({ id: 'new-player', ...data })),
          },
        },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: PingpongRatingService,
          useValue: {
            getDefaultRatings: () => ({ rating: 1500, rd: 350, vol: 0.06 }),
            calculateConservativeScore: (r: number, d: number) =>
              Math.max(0, r - 2 * d),
          },
        },
      ],
    }).compile();

    service = module.get(PingpongPlayersService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));
    competitorRepository = module.get(getRepositoryToken(Competitor));
  });

  function givenCompetitorExists() {
    jest.spyOn(competitorRepository, 'findOne').mockResolvedValue({
      id: COMPETITOR_ID,
      firstName: 'Marc',
      lastName: 'Dupont',
    } as Competitor);
  }

  describe('ensureEnrolled', () => {
    it('creates a player on first call', async () => {
      givenCompetitorExists();
      jest.spyOn(playerRepository, 'findOne').mockResolvedValue(null);

      const player = await service.ensureEnrolled(COMPETITOR_ID);

      expect(player.id).toBe('new-player');
      expect(playerRepository.save).toHaveBeenCalled();
    });

    it('returns the existing player on a second call', async () => {
      // Idempotent on purpose: two people recording their first match
      // against each other would otherwise race, and one would get a 409
      // for a match they legitimately played.
      givenCompetitorExists();
      const existing = { id: 'already-there' } as PingpongPlayer;
      jest.spyOn(playerRepository, 'findOne').mockResolvedValue(existing);

      const player = await service.ensureEnrolled(COMPETITOR_ID);

      expect(player).toBe(existing);
      expect(playerRepository.save).not.toHaveBeenCalled();
    });

    it('refuses a competitor who does not exist', async () => {
      // Enrolling an unknown id would create an orphan player row that no
      // screen could ever name.
      jest.spyOn(competitorRepository, 'findOne').mockResolvedValue(null);

      await expect(service.ensureEnrolled('ghost')).rejects.toThrow(
        /not found/i,
      );
    });

    it('starts a new player at the default rating', async () => {
      givenCompetitorExists();
      jest.spyOn(playerRepository, 'findOne').mockResolvedValue(null);

      await service.ensureEnrolled(COMPETITOR_ID);

      const [created] = (playerRepository.create as jest.Mock).mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(created).toMatchObject({ rating: 1500, rd: 350 });
    });
  });

  describe('enrol', () => {
    it('still rejects an explicit duplicate', async () => {
      // The explicit call keeps its 409: someone pressing "join" twice
      // should be told they already have, rather than silently no-op.
      givenCompetitorExists();
      jest
        .spyOn(playerRepository, 'findOne')
        .mockResolvedValue({ id: 'existing' } as PingpongPlayer);

      await expect(service.enrol(COMPETITOR_ID)).rejects.toThrow(
        /already plays/i,
      );
    });
  });
});
