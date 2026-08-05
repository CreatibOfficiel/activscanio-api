import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongPlayersService } from '../pingpong-players.service';
import { PingpongRatingService } from '../pingpong-rating.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { PingpongMatch } from '../../entities/pingpong-match.entity';
import { Competitor } from '../../../competitors/competitor.entity';

/**
 * What the match entry form is told about each pickable person.
 *
 * The form sorts its picker by who played most recently — the same handful
 * of colleagues play repeatedly, so surfacing them first saves the search.
 * That ordering needs a date per player, which is the only reason
 * `lastMatchAt` appears here.
 *
 * Ordering itself is left to the caller. The list is the whole office
 * (~35 rows), the front end already owns the picker's search and its
 * exclusion of the opposite side, and an order chosen here would be
 * re-derived there anyway the moment the user types. See the picker for the
 * ranking rules.
 */
describe('PingpongPlayersService — selectable opponents', () => {
  let service: PingpongPlayersService;

  const PLAYED_AT = new Date('2026-08-04T10:00:00.000Z');

  const buildService = async (
    competitors: Partial<Competitor>[],
    players: Partial<PingpongPlayer>[],
  ) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongPlayersService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { find: jest.fn().mockResolvedValue(players) },
        },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { find: jest.fn().mockResolvedValue(competitors) },
        },
        {
          provide: PingpongRatingService,
          useValue: {
            getDefaultRatings: () => ({ rating: 1500, rd: 350, vol: 0.06 }),
            calculateConservativeScore: (r: number, d: number) => r - 2 * d,
          },
        },
      ],
    }).compile();

    service = module.get<PingpongPlayersService>(PingpongPlayersService);
  };

  const competitor = (id: string, firstName: string): Partial<Competitor> => ({
    id,
    firstName,
    lastName: 'Dupont',
    profilePictureUrl: `${id}.png`,
  });

  it('reports when an enrolled player last played', async () => {
    await buildService(
      [competitor('comp-1', 'Marc')],
      [{ id: 'player-1', competitorId: 'comp-1', lastMatchAt: PLAYED_AT }],
    );

    const [player] = await service.getSelectableOpponents();

    expect(player.lastMatchAt).toEqual(PLAYED_AT);
  });

  /**
   * Enrolment happens on a first recorded match, so an enrolled player with
   * no date is possible only in the window between the two. Reported as null
   * rather than omitted, so the caller has one shape to handle.
   */
  it('reports a null date for an enrolled player who has not played', async () => {
    await buildService(
      [competitor('comp-1', 'Marc')],
      [{ id: 'player-1', competitorId: 'comp-1', lastMatchAt: null }],
    );

    const [player] = await service.getSelectableOpponents();

    expect(player.lastMatchAt).toBeNull();
  });

  /**
   * Someone who has never touched a bat has no `pingpong_players` row at
   * all. They stay selectable — that is how a first match gets recorded —
   * and their date is null rather than a fabricated one.
   */
  it('reports a null date for a competitor who never played ping-pong', async () => {
    await buildService([competitor('comp-2', 'Margot')], []);

    const [player] = await service.getSelectableOpponents();

    expect(player.playerId).toBeNull();
    expect(player.lastMatchAt).toBeNull();
  });

  /** The fields existing callers already read must keep arriving. */
  it('still reports the identity fields the picker renders', async () => {
    await buildService(
      [competitor('comp-1', 'Marc')],
      [{ id: 'player-1', competitorId: 'comp-1', lastMatchAt: PLAYED_AT }],
    );

    const [player] = await service.getSelectableOpponents();

    expect(player).toMatchObject({
      competitorId: 'comp-1',
      firstName: 'Marc',
      lastName: 'Dupont',
      profilePictureUrl: 'comp-1.png',
      playerId: 'player-1',
    });
  });
});
