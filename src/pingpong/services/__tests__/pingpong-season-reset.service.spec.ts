import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongSeasonResetService } from '../pingpong-season-reset.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';

/**
 * End-of-season reset for ping-pong.
 *
 * Destructive in the same way the decay is: it squishes ratings toward 1500,
 * so running it twice squishes twice, and the pre-reset numbers survive only
 * in the archive rows. The guard is the same one the decay uses — the WHERE
 * clause excludes anyone reset in the last day, and the same atomic UPDATE
 * stamps `lastSeasonResetAt`.
 *
 * The other half of what is tested here is what the reset must NOT touch.
 * Zeroing `weightedMatchCount` would put the entire league back into
 * calibration and empty the podium for weeks; squishing an absent player's
 * rating compounds into a stealth hard reset across missed seasons.
 */
describe('PingpongSeasonResetService', () => {
  let service: PingpongSeasonResetService;
  let playerRepository: Repository<PingpongPlayer>;
  let executed: string[];

  beforeEach(async () => {
    executed = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongSeasonResetService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: {
            query: jest.fn((sql: string) => {
              executed.push(sql);
              return Promise.resolve([]);
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PingpongSeasonResetService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));
  });

  const sql = () => executed.join('\n');
  const activeUpdate = () => executed.find((s) => /"rating"\s*=/.test(s))!;
  const inactiveUpdate = () => executed.find((s) => !/"rating"\s*=/.test(s))!;

  describe('the two paths', () => {
    it('runs one statement per path', async () => {
      await service.resetSeasonStats();
      expect(executed.filter((s) => /UPDATE/i.test(s))).toHaveLength(2);
    });

    it('squishes active players 75/25 toward 1500', async () => {
      await service.resetSeasonStats();

      expect(activeUpdate()).toMatch(/0\.75 \* "rating" \+ 0\.25 \* 1500/);
      expect(activeUpdate()).toMatch(/"currentSeasonMatchCount" > 0/);
    });

    it('leaves an absent player’s rating and volatility alone', async () => {
      await service.resetSeasonStats();

      // The whole point of the second path: a stealth hard reset otherwise.
      expect(inactiveUpdate()).toMatch(/"currentSeasonMatchCount" = 0/);
      expect(inactiveUpdate()).not.toMatch(/"rating"\s*=/);
      expect(inactiveUpdate()).not.toMatch(/"vol"\s*=/);
      expect(inactiveUpdate()).not.toMatch(/"currentStreak"\s*=/);
    });

    it('bumps the deviation on both paths, capped at 350', async () => {
      await service.resetSeasonStats();

      for (const update of [activeUpdate(), inactiveUpdate()]) {
        expect(update).toMatch(/"rd"\s*=/);
        expect(update).toMatch(/LEAST/i);
        expect(update).toMatch(/350/);
        expect(update).toMatch(/173\.7178/);
      }
    });

    it('clears the season counter and streak for active players only', async () => {
      await service.resetSeasonStats();

      expect(activeUpdate()).toMatch(/"currentSeasonMatchCount" = 0/);
      expect(activeUpdate()).toMatch(/"currentStreak" = 0/);
    });
  });

  describe('idempotency guard', () => {
    it('excludes players already reset, on both paths', async () => {
      await service.resetSeasonStats();

      for (const update of [activeUpdate(), inactiveUpdate()]) {
        expect(update).toMatch(/"lastSeasonResetAt" IS NULL/);
        expect(update).toMatch(/lastSeasonResetAt" < now\(\)/);
      }
    });

    it('stamps lastSeasonResetAt in the same statement that changes the rating', async () => {
      await service.resetSeasonStats();

      for (const update of [activeUpdate(), inactiveUpdate()]) {
        expect(update).toMatch(/"lastSeasonResetAt" = now\(\)/);
      }
    });
  });

  describe('what it must not touch', () => {
    it('never zeroes the counters that leave calibration', async () => {
      await service.resetSeasonStats();

      // weightedMatchCount is the only counter that ends calibration.
      // Resetting it would send the whole league back to provisional.
      expect(sql()).not.toMatch(/"weightedMatchCount"\s*=/);
      expect(sql()).not.toMatch(/"matchCount"\s*=/);
    });

    it('keeps lifetime records', async () => {
      await service.resetSeasonStats();

      for (const column of [
        'wins',
        'losses',
        'setsWon',
        'setsLost',
        'bestStreak',
      ]) {
        expect(sql()).not.toMatch(new RegExp(`"${column}"\\s*=`));
      }
    });

    it('never touches the Mario Kart competitors table', async () => {
      await service.resetSeasonStats();

      expect(sql()).not.toMatch(/\bcompetitors\b/);
      expect(sql()).toMatch(/pingpong_players/);
    });
  });

  it('reports how many players each path touched', async () => {
    jest
      .spyOn(playerRepository, 'query')
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValueOnce([{ id: 'c' }]);

    const result = await service.resetSeasonStats();

    expect(result).toEqual({ active: 2, inactive: 1 });
  });
});
