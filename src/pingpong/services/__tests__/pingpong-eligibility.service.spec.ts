/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PingpongEligibilityService } from '../pingpong-eligibility.service';
import { PingpongPlayer } from '../../entities/pingpong-player.entity';
import { PingpongMatch } from '../../entities/pingpong-match.entity';

/**
 * Ranking eligibility — the third anti-farming layer.
 *
 * Unlike the other two, this one never touches a rating. A player who only
 * ever faces the same opponent keeps a perfectly real rating; they simply do
 * not appear in the ranked table until they have played a spread of people.
 */
describe('PingpongEligibilityService', () => {
  let service: PingpongEligibilityService;
  let playerRepository: Repository<PingpongPlayer>;
  let matchRepository: Repository<PingpongMatch>;

  const PLAYER = 'player-1';

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

  function withMatches(matches: PingpongMatch[]) {
    jest
      .spyOn(playerRepository, 'find')
      .mockResolvedValue([{ id: PLAYER } as PingpongPlayer]);
    jest.spyOn(matchRepository, 'find').mockResolvedValue(matches);
  }

  it('refuses eligibility below four distinct opponents', async () => {
    withMatches(matchesAgainst(['x', 'x', 'y', 'y', 'z', 'z']));

    await service.refreshEligibility();

    expect(playerRepository.update).toHaveBeenCalledWith(
      PLAYER,
      expect.objectContaining({
        isRankingEligible: false,
        distinctOpponents21d: 3,
      }),
    );
  });

  it('grants eligibility on four evenly faced opponents', async () => {
    withMatches(matchesAgainst(['w', 'x', 'y', 'z', 'w', 'x', 'y', 'z']));

    await service.refreshEligibility();

    expect(playerRepository.update).toHaveBeenCalledWith(
      PLAYER,
      expect.objectContaining({
        isRankingEligible: true,
        distinctOpponents21d: 4,
      }),
    );
  });

  it('refuses eligibility when one opponent dominates the record', async () => {
    // Five distinct opponents, but 90% of matches against a single one.
    const lopsided = [
      ...Array<string>(18).fill('main'),
      'a',
      'b',
    ];
    withMatches(matchesAgainst(lopsided));

    await service.refreshEligibility();

    const call = (playerRepository.update as jest.Mock).mock.calls[0][1] as {
      isRankingEligible: boolean;
      diversityScore21d: number;
    };
    expect(call.diversityScore21d).toBeLessThan(0.5);
    expect(call.isRankingEligible).toBe(false);
  });

  it('counts opponents from both sides of a match', async () => {
    // The player sat on side B for half of these.
    const mixed = [
      { id: 'm1', playerAId: PLAYER, playerBId: 'w' },
      { id: 'm2', playerAId: 'x', playerBId: PLAYER },
      { id: 'm3', playerAId: PLAYER, playerBId: 'y' },
      { id: 'm4', playerAId: 'z', playerBId: PLAYER },
    ] as PingpongMatch[];
    withMatches(mixed);

    await service.refreshEligibility();

    expect(playerRepository.update).toHaveBeenCalledWith(
      PLAYER,
      expect.objectContaining({ distinctOpponents21d: 4 }),
    );
  });

  it('refuses eligibility for a player with no recent matches', async () => {
    withMatches([]);

    await service.refreshEligibility();

    expect(playerRepository.update).toHaveBeenCalledWith(
      PLAYER,
      expect.objectContaining({
        isRankingEligible: false,
        distinctOpponents21d: 0,
        diversityScore21d: 0,
      }),
    );
  });

  it('never writes a rating field', async () => {
    // Proof that layer (c) stays out of the rating path entirely.
    withMatches(matchesAgainst(['w', 'x', 'y', 'z']));

    await service.refreshEligibility();

    const payload = (playerRepository.update as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('rating');
    expect(payload).not.toHaveProperty('rd');
    expect(payload).not.toHaveProperty('vol');
  });
});
