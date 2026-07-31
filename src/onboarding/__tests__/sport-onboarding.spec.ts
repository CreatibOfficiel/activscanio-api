import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OnboardingService } from '../onboarding.service';
import { Competitor } from '../../competitors/competitor.entity';
import { CharacterVariant } from '../../character-variants/character-variant.entity';
import { SportPreference, User, UserRole } from '../../users/user.entity';

/**
 * Onboarding a ping-pong player.
 *
 * The flow was built around a betting-era distinction: `isSpectator` meant
 * "watches without racing", and that path assigned UserRole.BETTOR and
 * skipped character selection.
 *
 * A ping-pong-only player needs the same SHAPE — a competitor identity, no
 * Mario Kart character — but they are not a spectator and must not be
 * labelled one. Reusing the old flag would file every ping-pong player under
 * a role that means "does not compete", which is exactly wrong.
 *
 * So the flag is gone and the sport preference carries the information: it
 * decides both the role and whether a character is required.
 */
describe('OnboardingService — sport preference', () => {
  let service: OnboardingService;
  let savedUser: Partial<User>;
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const USER_ID = 'user-1';

  beforeEach(async () => {
    savedUser = {};
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn((value: Partial<User>) => {
        // Only the user save is interesting; competitors get an id.
        if (value && 'firstName' in value && !('clerkId' in value)) {
          return Promise.resolve({ ...value, id: 'new-competitor' });
        }
        savedUser = value;
        return Promise.resolve(value);
      }),
    };

    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: DataSource,
          useValue: { createQueryRunner: () => queryRunner },
        },
        { provide: getRepositoryToken(Competitor), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(CharacterVariant), useValue: {} },
      ],
    }).compile();

    service = module.get(OnboardingService);
  });

  /** The user row the service starts from. */
  function givenUser() {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === User) {
        return Promise.resolve({ id: USER_ID, clerkId: 'clerk-1' });
      }
      if (entity === Competitor) {
        return Promise.resolve({
          id: 'comp-1',
          firstName: 'Marc',
          lastName: 'Dupont',
        });
      }
      if (entity === CharacterVariant) {
        return Promise.resolve({ id: 'variant-1' });
      }
      return Promise.resolve(null);
    });
  }

  describe('a ping-pong-only player', () => {
    it('is a player, not a spectator', async () => {
      // The heart of it. Filing them as BETTOR would mean "does not
      // compete", which is the opposite of true.
      givenUser();

      await service.completeOnboarding(USER_ID, {
        sportPreference: SportPreference.PINGPONG,
        existingCompetitorId: 'comp-1',
      });

      expect(savedUser.role).toBe(UserRole.PLAYER);
    });

    it('gets a competitor identity', async () => {
      // They need one: matches are recorded against a competitor.
      givenUser();

      await service.completeOnboarding(USER_ID, {
        sportPreference: SportPreference.PINGPONG,
        existingCompetitorId: 'comp-1',
      });

      expect(savedUser.competitorId).toBe('comp-1');
    });

    it('needs no Mario Kart character', async () => {
      // A character is a racing concept. Requiring one would make the
      // ping-pong-only flow impossible to complete.
      givenUser();

      await expect(
        service.completeOnboarding(USER_ID, {
          sportPreference: SportPreference.PINGPONG,
          existingCompetitorId: 'comp-1',
        }),
      ).resolves.toBeDefined();
    });

    it('stores the preference', async () => {
      givenUser();

      await service.completeOnboarding(USER_ID, {
        sportPreference: SportPreference.PINGPONG,
        existingCompetitorId: 'comp-1',
      });

      expect(savedUser.sportPreference).toBe(SportPreference.PINGPONG);
    });

    it('can be created from a brand new competitor', async () => {
      manager.findOne.mockImplementation((entity: unknown) =>
        entity === User
          ? Promise.resolve({ id: USER_ID, clerkId: 'clerk-1' })
          : Promise.resolve(null),
      );

      await service.completeOnboarding(USER_ID, {
        sportPreference: SportPreference.PINGPONG,
        newCompetitor: { firstName: 'Julie', lastName: 'Martin' },
      });

      expect(savedUser.competitorId).toBe('new-competitor');
      expect(savedUser.role).toBe(UserRole.PLAYER);
    });
  });

  describe('a Mario Kart player', () => {
    it('still needs a character', async () => {
      // The existing rule, unchanged: a racer picks a character.
      givenUser();

      await expect(
        service.completeOnboarding(USER_ID, {
          sportPreference: SportPreference.MARIO_KART,
          existingCompetitorId: 'comp-1',
        }),
      ).rejects.toThrow(/[Cc]haracter/);
    });

    it('completes with one', async () => {
      givenUser();

      await service.completeOnboarding(USER_ID, {
        sportPreference: SportPreference.MARIO_KART,
        existingCompetitorId: 'comp-1',
        characterVariantId: 'variant-1',
      });

      expect(savedUser.role).toBe(UserRole.PLAYER);
      expect(savedUser.sportPreference).toBe(SportPreference.MARIO_KART);
    });
  });

  describe('a player who does both', () => {
    it('needs a character, because they race', async () => {
      givenUser();

      await expect(
        service.completeOnboarding(USER_ID, {
          sportPreference: SportPreference.BOTH,
          existingCompetitorId: 'comp-1',
        }),
      ).rejects.toThrow(/[Cc]haracter/);
    });

    it('completes with one', async () => {
      givenUser();

      await service.completeOnboarding(USER_ID, {
        sportPreference: SportPreference.BOTH,
        existingCompetitorId: 'comp-1',
        characterVariantId: 'variant-1',
      });

      expect(savedUser.sportPreference).toBe(SportPreference.BOTH);
    });
  });

  it('defaults to both when no preference is sent', async () => {
    // An older client that does not know about the field must still be able
    // to onboard someone.
    givenUser();

    await service.completeOnboarding(USER_ID, {
      existingCompetitorId: 'comp-1',
      characterVariantId: 'variant-1',
    });

    expect(savedUser.sportPreference).toBe(SportPreference.BOTH);
  });

  it('never assigns the legacy bettor role', async () => {
    // It only exists so rows written before the betting removal still load.
    givenUser();

    await service.completeOnboarding(USER_ID, {
      sportPreference: SportPreference.PINGPONG,
      existingCompetitorId: 'comp-1',
    });

    expect(savedUser.role).not.toBe(UserRole.BETTOR);
  });
});
