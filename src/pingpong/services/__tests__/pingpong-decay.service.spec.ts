/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongDecayService } from '../pingpong-decay.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { Competitor } from '../../../competitors/competitor.entity';

/**
 * Weekly inactivity decay.
 *
 * This is the most destructive thing in the module if it goes wrong. Running
 * the formula twice on the same player inflates the deviation, collapses the
 * conservative score, and wrecks the leaderboard — silently, with no
 * exception and nothing in the logs.
 *
 * The guard is a single atomic UPDATE whose WHERE clause excludes anyone
 * already decayed this week, and which stamps lastDecayAt in the same
 * statement. No window between read and write, so no race even across
 * instances.
 */
describe('PingpongDecayService', () => {
  let service: PingpongDecayService;
  let playerRepository: Repository<PingpongPlayer>;
  let competitorRepository: Repository<Competitor>;
  let executed: string[];

  beforeEach(async () => {
    executed = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongDecayService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: {
            query: jest.fn((sql: string) => {
              executed.push(sql);
              return Promise.resolve([]);
            }),
            manager: {
              query: jest.fn((sql: string) => {
                executed.push(sql);
                return Promise.resolve([]);
              }),
            },
          },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: { update: jest.fn(), find: jest.fn(), query: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PingpongDecayService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));
    competitorRepository = module.get(getRepositoryToken(Competitor));
  });

  const sql = () => executed.join('\n');

  describe('idempotency guard', () => {
    it('filters on lastDecayAt as well as lastMatchAt', () => {
      // Both predicates must be in the WHERE clause. A rewrite that drops the
      // lastDecayAt one would leave no trace until the leaderboard collapsed,
      // so the guard is asserted at the SQL level.
      return service.runDecay().then(() => {
        expect(sql()).toMatch(/lastMatchAt/);
        expect(sql()).toMatch(/lastDecayAt/);
      });
    });

    it('stamps lastDecayAt in the same statement that changes the deviation', async () => {
      await service.runDecay();

      // One UPDATE, setting both. Two statements would open a window where a
      // crash in between leaves the deviation raised but unstamped — and the
      // next run would raise it again.
      const updates = executed.filter((s) => /UPDATE/i.test(s));
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatch(/"rd"\s*=/);
      expect(updates[0]).toMatch(/"lastDecayAt"\s*=/);
    });

    it('caps the deviation at 350 inside the SQL', async () => {
      await service.runDecay();

      // Third barrier: even if both guards above failed, the deviation cannot
      // exceed the maximum.
      expect(sql()).toMatch(/LEAST/i);
      expect(sql()).toMatch(/350/);
    });
  });

  describe('what it touches', () => {
    it('leaves rating and volatility alone', async () => {
      await service.runDecay();

      const update = executed.find((s) => /UPDATE/i.test(s))!;
      // Only the deviation decays. Time passing says nothing about strength,
      // only about how sure we are of it.
      expect(update).not.toMatch(/"rating"\s*=/);
      expect(update).not.toMatch(/"vol"\s*=/);
    });

    it('never touches the Mario Kart competitors table', async () => {
      await service.runDecay();

      expect(sql()).not.toMatch(/\bcompetitors\b/);
      expect(competitorRepository.update).not.toHaveBeenCalled();
    });

    it('targets the ping-pong players table', async () => {
      await service.runDecay();
      expect(sql()).toMatch(/pingpong_players/);
    });
  });

  describe('formula', () => {
    it('uses the documented growth constant', async () => {
      await service.runDecay();
      // sqrt(rd² + 68²): 68 takes a deviation from 50 back to 350 over about
      // 26 weeks, which is the intended half-year to full uncertainty.
      expect(sql()).toMatch(/68/);
      expect(sql()).toMatch(/sqrt|SQRT/);
    });

    it('only considers players idle for more than seven days', async () => {
      await service.runDecay();
      expect(sql()).toMatch(/7 days|interval '7/i);
    });
  });

  it('reports how many players it touched', async () => {
    jest
      .spyOn(playerRepository, 'query')
      .mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const count = await service.runDecay();
    expect(count).toBe(2);
  });
});
