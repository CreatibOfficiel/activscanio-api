import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PingpongModule } from '../pingpong.module';
import { PingpongController } from '../pingpong.controller';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { PingpongEloSnapshot } from '../entities/pingpong-elo-snapshot.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { PingpongDecayService } from '../services/pingpong-decay.service';
import { PingpongEligibilityService } from '../services/pingpong-eligibility.service';
import { PingpongHighlightStatsService } from '../services/pingpong-highlight-stats.service';
import { PingpongPlayersService } from '../services/pingpong-players.service';
import { PingpongRatingService } from '../services/pingpong-rating.service';
import { PingpongMatchService } from '../services/pingpong-match.service';
import { PingpongRankSnapshotService } from '../services/pingpong-rank-snapshot.service';
import { PingpongRecomputeService } from '../services/pingpong-recompute.service';

/**
 * Module wiring.
 *
 * A service injected by a cron but never listed as a provider fails at
 * application boot, not at compile time and not in any unit test — every unit
 * test builds its own provider list, so the real module is never exercised.
 * The failure surfaces in production, on deploy, as a container that will not
 * start. `PingpongDecayService` shipped in exactly that state.
 *
 * Only the repositories are faked; the module's own provider list is real.
 */
describe('PingpongModule', () => {
  const ENTITIES = [
    PingpongPlayer,
    PingpongMatch,
    PingpongEloSnapshot,
    Competitor,
  ];

  /**
   * Stands in for TypeOrmModule.forRoot, which normally supplies the
   * repositories and the DataSource. Global so PingpongModule can see it
   * without importing anything it would not import in production.
   */
  @Global()
  @Module({
    providers: [
      // PingpongMatchService takes the DataSource directly: recording a match
      // runs in one transaction with both players locked for update.
      { provide: DataSource, useValue: {} },
      ...ENTITIES.map((entity) => ({
        provide: getRepositoryToken(entity),
        useValue: {},
      })),
    ],
    exports: [DataSource, ...ENTITIES.map((e) => getRepositoryToken(e))],
  })
  class FakePersistenceModule {}

  async function compileModule() {
    const builder = Test.createTestingModule({
      imports: [FakePersistenceModule, PingpongModule],
    });
    // PingpongModule declares TypeOrmModule.forFeature, which would otherwise
    // try to reach a real connection.
    for (const entity of ENTITIES) {
      builder.overrideProvider(getRepositoryToken(entity)).useValue({});
    }
    return builder.compile();
  }

  it('resolves every service it declares', async () => {
    const module = await compileModule();

    for (const service of [
      PingpongRatingService,
      PingpongMatchService,
      PingpongPlayersService,
      PingpongEligibilityService,
      PingpongHighlightStatsService,
      PingpongDecayService,
      PingpongRankSnapshotService,
      PingpongRecomputeService,
    ]) {
      expect(module.get(service)).toBeDefined();
    }
  });

  it('resolves the controller, which needs ConfigService for the admin guard', async () => {
    // The recompute endpoint reads ADMIN_SECRET off ConfigService. A
    // controller dependency the module does not supply fails at boot, not at
    // compile time — the same failure mode PingpongDecayService shipped with.
    const module = await compileModule();

    expect(module.get(PingpongController)).toBeDefined();
  });

  it('exports the services injected from outside the module', () => {
    // TasksService injects these across the module boundary, so being a
    // provider is not enough — an unexported provider resolves inside the
    // module and still fails at boot. Read off the decorator metadata
    // rather than the compiled container, which happily resolves internals.
    const exports = Reflect.getMetadata('exports', PingpongModule) as unknown[];

    // PingpongDecayService is driven by the weekly RD-decay cron.
    expect(exports).toContain(PingpongDecayService);
    // PingpongEligibilityService and PingpongPlayersService likewise.
    expect(exports).toContain(PingpongEligibilityService);
    expect(exports).toContain(PingpongPlayersService);
    // PingpongRankSnapshotService is driven by the daily rank-capture cron.
    expect(exports).toContain(PingpongRankSnapshotService);
  });
});
