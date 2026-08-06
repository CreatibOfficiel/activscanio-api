import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongController } from '../pingpong.controller';
import { PingpongPlayersService } from '../services/pingpong-players.service';
import { PingpongMatchService } from '../services/pingpong-match.service';
import { PingpongBestWinService } from '../services/pingpong-best-win.service';
import { PingpongRecomputeService } from '../services/pingpong-recompute.service';
import { ConfigService } from '@nestjs/config';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { PingpongEloSnapshot } from '../entities/pingpong-elo-snapshot.entity';

/**
 * The rating history window.
 *
 * `GET /pingpong/players/:competitorId/history?days=N` computed a `since`
 * date from the parameter and then never used it: the query filtered on
 * `playerId` alone. The endpoint accepted the parameter, appeared to honour
 * it, and returned the whole history regardless — a chart asking for 30 days
 * would silently plot everything.
 *
 * Nothing failed. The response was valid, just wider than requested, which
 * is exactly the kind of bug that survives review.
 */
describe('PingpongController — history window', () => {
  let controller: PingpongController;
  let snapshotRepository: { find: jest.Mock };

  beforeEach(async () => {
    snapshotRepository = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PingpongController],
      providers: [
        {
          provide: PingpongPlayersService,
          useValue: {
            getPlayerByCompetitorId: jest.fn().mockResolvedValue({ id: 'p1' }),
          },
        },
        { provide: PingpongMatchService, useValue: {} },
        { provide: PingpongBestWinService, useValue: {} },
        { provide: PingpongRecomputeService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: getRepositoryToken(PingpongMatch), useValue: {} },
        {
          provide: getRepositoryToken(PingpongEloSnapshot),
          useValue: snapshotRepository,
        },
      ],
    }).compile();

    controller = module.get(PingpongController);
  });

  /** The `where` clause of the only query made. */
  function whereClause(): Record<string, unknown> {
    const [options] = snapshotRepository.find.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    return options.where;
  }

  it('filters on the requested window', async () => {
    await controller.getPlayerHistory('comp-1', '30');

    // The bug: `since` was computed and discarded, so this key was absent
    // and every request returned the full history.
    expect(whereClause()).toHaveProperty('date');
  });

  it('asks for the player it was given', async () => {
    await controller.getPlayerHistory('comp-1', '30');

    expect(whereClause()).toMatchObject({ playerId: 'p1' });
  });

  it('reaches further back for a longer window', async () => {
    // Proves the parameter reaches the query rather than being a constant.
    // The operator stringifies to "[object Object]", so compare the value
    // it carries rather than the wrapper.
    const boundary = () => (whereClause().date as { value: string }).value;

    await controller.getPlayerHistory('comp-1', '7');
    const short = boundary();

    snapshotRepository.find.mockClear();
    await controller.getPlayerHistory('comp-1', '365');
    const long = boundary();

    expect(long < short).toBe(true);
  });

  it('defaults to ninety days', async () => {
    await controller.getPlayerHistory('comp-1');

    expect(whereClause()).toHaveProperty('date');
  });

  it('returns oldest first, for a chart', async () => {
    await controller.getPlayerHistory('comp-1', '30');

    const [options] = snapshotRepository.find.mock.calls[0] as [
      { order: Record<string, string> },
    ];
    expect(options.order).toEqual({ date: 'ASC' });
  });
});
