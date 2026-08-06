import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongController } from '../pingpong.controller';
import { PingpongPlayersService } from '../services/pingpong-players.service';
import { PingpongMatchService } from '../services/pingpong-match.service';
import { PingpongBestWinService } from '../services/pingpong-best-win.service';
import { PingpongRecomputeService } from '../services/pingpong-recompute.service';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { PingpongEloSnapshot } from '../entities/pingpong-elo-snapshot.entity';

/**
 * The admin-guarded recompute endpoint.
 *
 * This rewrites every rating in the league, so the guard is the feature. It
 * follows the same ADMIN_SECRET query-parameter shape as
 * `POST /achievements/admin/seed-and-backfill`, including the refusal when the
 * secret is unset — an unconfigured environment must not become an open door.
 */
describe('PingpongController — admin recompute', () => {
  let controller: PingpongController;
  let recomputeService: { recompute: jest.Mock };
  let configService: { get: jest.Mock };

  const REPORT = {
    dryRun: false,
    playersRecomputed: 3,
    matchesReplayed: 15,
    players: [],
    matches: [],
  };

  beforeEach(async () => {
    recomputeService = { recompute: jest.fn().mockResolvedValue(REPORT) };
    configService = { get: jest.fn().mockReturnValue('the-secret') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PingpongController],
      providers: [
        { provide: PingpongPlayersService, useValue: {} },
        { provide: PingpongMatchService, useValue: {} },
        { provide: PingpongBestWinService, useValue: {} },
        { provide: PingpongRecomputeService, useValue: recomputeService },
        { provide: ConfigService, useValue: configService },
        { provide: getRepositoryToken(PingpongMatch), useValue: {} },
        { provide: getRepositoryToken(PingpongEloSnapshot), useValue: {} },
      ],
    }).compile();

    controller = module.get(PingpongController);
  });

  describe('the guard', () => {
    it('runs the recompute when the secret matches', async () => {
      const result = await controller.recomputeRatings('the-secret');

      expect(recomputeService.recompute).toHaveBeenCalled();
      expect(result).toEqual(REPORT);
    });

    it('refuses a wrong secret', async () => {
      await expect(controller.recomputeRatings('nope')).rejects.toThrow(
        ForbiddenException,
      );
      expect(recomputeService.recompute).not.toHaveBeenCalled();
    });

    it('refuses a missing secret', async () => {
      await expect(
        controller.recomputeRatings(undefined as unknown as string),
      ).rejects.toThrow(ForbiddenException);
      expect(recomputeService.recompute).not.toHaveBeenCalled();
    });

    it('refuses when ADMIN_SECRET is not configured at all', async () => {
      // Otherwise an environment that simply forgot to set it would accept
      // an empty `?secret=` and let anyone rewrite every rating.
      configService.get.mockReturnValue(undefined);

      await expect(
        controller.recomputeRatings(undefined as unknown as string),
      ).rejects.toThrow(ForbiddenException);
      expect(recomputeService.recompute).not.toHaveBeenCalled();
    });

    it('refuses an empty configured secret', async () => {
      configService.get.mockReturnValue('');

      await expect(controller.recomputeRatings('')).rejects.toThrow(
        ForbiddenException,
      );
      expect(recomputeService.recompute).not.toHaveBeenCalled();
    });
  });

  describe('dry run', () => {
    it('defaults to a real run', async () => {
      await controller.recomputeRatings('the-secret');

      expect(recomputeService.recompute).toHaveBeenCalledWith({
        dryRun: false,
      });
    });

    it('passes dryRun through when asked', async () => {
      await controller.recomputeRatings('the-secret', 'true');

      expect(recomputeService.recompute).toHaveBeenCalledWith({ dryRun: true });
    });

    it('treats any value other than "true" as a real run', async () => {
      // A query string is text. Anything truthy-looking but unrecognised must
      // fail towards the safer reading rather than silently writing.
      await controller.recomputeRatings('the-secret', 'yes');

      expect(recomputeService.recompute).toHaveBeenCalledWith({
        dryRun: false,
      });
    });
  });
});
