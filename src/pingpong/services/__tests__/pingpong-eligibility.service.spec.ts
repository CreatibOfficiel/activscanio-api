import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongEligibilityService } from '../pingpong-eligibility.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { PingpongMatch } from '../../entities/pingpong-match.entity';

/**
 * Opponent diversity — measured, never a gate.
 *
 * An earlier version of this service hid players from the ranking until they
 * had faced 4 distinct opponents in 21 days. Research into how real systems
 * handle this said to drop it: FIDE, USATT, Lichess and TrueSkill all gate on
 * match count or rating deviation, never on who you played. Glickman's own
 * paper treats repeat opponents as ordinary games. And in a 25-person office,
 * someone playing three lunchtime games a week with the same two colleagues
 * reaches nine matches and would still never appear — the rule punished
 * exactly the most active players.
 *
 * Farming is already handled where it belongs, in the rating path: the
 * per-pair weighting means a fourth match against the same person in a week
 * carries half weight, and a seventh carries none. Diversity survives here as
 * a measurement, shown as a badge, not as a wall.
 */
describe('PingpongEligibilityService', () => {
  let service: PingpongEligibilityService;
  let playerRepository: Repository<PingpongPlayer>;
  let matchRepository: Repository<PingpongMatch>;

  const PLAYER = 'player-1';

  /** The payload of the first update() call. */
  function firstUpdatePayload(): {
    isRankingEligible: boolean;
    distinctOpponents21d: number;
    diversityScore21d: number;
  } {
    const calls = (playerRepository.update as jest.Mock).mock.calls as [
      unknown,
      {
        isRankingEligible: boolean;
        distinctOpponents21d: number;
        diversityScore21d: number;
      },
    ][];
    return calls[0][1];
  }

  /** Matches where PLAYER faced the given opponents, one entry per match. */
  function matchesAgainst(opponentIds: string[]): PingpongMatch[] {
    return opponentIds.map(
      (opponentId, i) =>
        ({
          id: `m${i}`,
          playerAId: PLAYER,
          playerBId: opponentId,
        }) as PingpongMatch,
    );
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PingpongEligibilityService,
        {
          provide: getRepositoryToken(PingpongPlayer),
          useValue: { find: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(PingpongMatch),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PingpongEligibilityService);
    playerRepository = module.get(getRepositoryToken(PingpongPlayer));
    matchRepository = module.get(getRepositoryToken(PingpongMatch));
  });

  function withMatches(
    matches: PingpongMatch[],
    player: Partial<PingpongPlayer> = {},
  ) {
    jest
      .spyOn(playerRepository, 'find')
      .mockResolvedValue([
        { id: PLAYER, weightedMatchCount: 10, ...player } as PingpongPlayer,
      ]);
    jest.spyOn(matchRepository, 'find').mockResolvedValue(matches);
  }

  describe('ranking eligibility', () => {
    it('ranks a player who only ever faces one opponent', async () => {
      // The case the old rule excluded. Their rating is real — it is just
      // anchored to one point in the field, which the deviation already says.
      withMatches(matchesAgainst(['same', 'same', 'same', 'same', 'same']));

      await service.refreshEligibility();

      const payload = firstUpdatePayload();
      expect(payload.isRankingEligible).toBe(true);
      expect(payload.distinctOpponents21d).toBe(1);
    });

    it('ranks a player with a lopsided record', async () => {
      // 18 matches against one person, 2 against others. Diversity is low and
      // reported as such, but they stay on the board.
      const lopsided = [...Array<string>(18).fill('main'), 'a', 'b'];
      withMatches(matchesAgainst(lopsided));

      await service.refreshEligibility();

      const payload = firstUpdatePayload();
      expect(payload.diversityScore21d).toBeLessThan(0.5);
      expect(payload.isRankingEligible).toBe(true);
    });

    it('withholds a ranking until the player has left calibration', async () => {
      // The one real gate: enough weighted matches for the rating to mean
      // something. Reads the WEIGHTED count, so farming one opponent does not
      // buy a way out of it.
      withMatches(matchesAgainst(['w', 'x', 'y', 'z']), {
        weightedMatchCount: 3,
      });

      await service.refreshEligibility();

      expect(firstUpdatePayload().isRankingEligible).toBe(false);
    });

    it('ranks a player the moment calibration is complete', async () => {
      withMatches(matchesAgainst(['w', 'x']), { weightedMatchCount: 8 });

      await service.refreshEligibility();

      expect(firstUpdatePayload().isRankingEligible).toBe(true);
    });

    it('does not rank a player who has never played', async () => {
      withMatches([], { weightedMatchCount: 0 });

      await service.refreshEligibility();

      expect(firstUpdatePayload()).toMatchObject({
        isRankingEligible: false,
        distinctOpponents21d: 0,
        diversityScore21d: 0,
      });
    });

    it('keeps ranking a player who stopped playing recently', async () => {
      // No matches in the window, but calibrated. Inactivity widens the
      // deviation through the weekly decay, which sinks them on the board on
      // its own — removing them outright would erase them from the office.
      withMatches([], { weightedMatchCount: 20 });

      await service.refreshEligibility();

      expect(firstUpdatePayload().isRankingEligible).toBe(true);
    });
  });

  describe('diversity measurement', () => {
    it('counts distinct opponents from both sides of a match', async () => {
      const mixed = [
        { id: 'm1', playerAId: PLAYER, playerBId: 'w' },
        { id: 'm2', playerAId: 'x', playerBId: PLAYER },
        { id: 'm3', playerAId: PLAYER, playerBId: 'y' },
        { id: 'm4', playerAId: 'z', playerBId: PLAYER },
      ] as PingpongMatch[];
      withMatches(mixed);

      await service.refreshEligibility();

      expect(firstUpdatePayload().distinctOpponents21d).toBe(4);
    });

    it('scores an even spread near the top', async () => {
      withMatches(matchesAgainst(['w', 'x', 'y', 'z', 'w', 'x', 'y', 'z']));

      await service.refreshEligibility();

      expect(firstUpdatePayload().diversityScore21d).toBeGreaterThan(0.9);
    });

    it('scores a single opponent at zero', async () => {
      withMatches(matchesAgainst(['same', 'same', 'same']));

      await service.refreshEligibility();

      expect(firstUpdatePayload().diversityScore21d).toBe(0);
    });
  });

  it('never writes a rating field', async () => {
    // The guarantee that has not changed: this service stays out of the
    // rating path entirely. A scheduling habit must not distort a
    // measurement — at most it changes what we display.
    withMatches(matchesAgainst(['w', 'x', 'y', 'z']));

    await service.refreshEligibility();

    const calls = (playerRepository.update as jest.Mock).mock.calls as [
      unknown,
      Record<string, unknown>,
    ][];
    const payload = calls[0][1];
    expect(payload).not.toHaveProperty('rating');
    expect(payload).not.toHaveProperty('rd');
    expect(payload).not.toHaveProperty('vol');
  });
});
