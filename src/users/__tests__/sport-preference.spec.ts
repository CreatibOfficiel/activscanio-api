import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { ChangeSportPreferenceDto } from '../dto/change-sport-preference.dto';
import { SportPreference } from '../user.entity';

/**
 * Changing which sport a user follows.
 *
 * The interesting property is not that it writes the field — it is what it
 * refuses to write. The generic PATCH :id accepts the whole UpdateUserDto,
 * role and competitorId included, so routing this through a narrow DTO is
 * the only thing stopping a user from promoting themselves while changing
 * their sport.
 */
describe('Sport preference', () => {
  describe('ChangeSportPreferenceDto', () => {
    // Same options as the global pipe in main.ts. Testing with `whitelist`
    // on would prove a protection production does not have.
    async function errorsFor(payload: Record<string, unknown>) {
      const dto = plainToInstance(ChangeSportPreferenceDto, payload);
      return validate(dto, { forbidUnknownValues: false });
    }

    it.each([
      SportPreference.MARIO_KART,
      SportPreference.PINGPONG,
      SportPreference.BOTH,
    ])('accepts %s', async (sportPreference) => {
      expect(await errorsFor({ sportPreference })).toHaveLength(0);
    });

    it('rejects a value outside the three', async () => {
      const errors = await errorsFor({ sportPreference: 'petanque' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a missing preference', async () => {
      const errors = await errorsFor({});
      expect(errors.length).toBeGreaterThan(0);
    });

    it('does not itself stop extra fields being sent', async () => {
      // Worth stating plainly: the pipe runs without `whitelist`, so a
      // smuggled `role` survives validation. What protects the account is
      // the controller, which never reads anything but `sportPreference` —
      // see the controller tests below. If `whitelist` is ever turned on,
      // this expectation flips and should be updated deliberately.
      const errors = await errorsFor({
        sportPreference: SportPreference.BOTH,
        role: 'player',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('UsersController', () => {
    let controller: UsersController;
    let usersService: { getOrCreateByClerkId: jest.Mock; update: jest.Mock };

    beforeEach(async () => {
      usersService = {
        getOrCreateByClerkId: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', clerkId: 'clerk-1' }),
        update: jest
          .fn()
          .mockImplementation((id: string, patch: Record<string, unknown>) => ({
            id,
            ...patch,
          })),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [{ provide: UsersService, useValue: usersService }],
      }).compile();

      controller = module.get(UsersController);
    });

    it('writes the preference for the caller', async () => {
      await controller.changeSportPreference('clerk-1', {
        sportPreference: SportPreference.PINGPONG,
      });

      expect(usersService.update).toHaveBeenCalledWith('user-1', {
        sportPreference: SportPreference.PINGPONG,
      });
    });

    it('resolves the user from the token, never from the body', async () => {
      // The id written comes from getOrCreateByClerkId, so there is no
      // parameter a caller could point at someone else's account.
      await controller.changeSportPreference('clerk-1', {
        sportPreference: SportPreference.BOTH,
      });

      expect(usersService.getOrCreateByClerkId).toHaveBeenCalledWith('clerk-1');
      const [writtenId] = usersService.update.mock.calls[0] as [string];
      expect(writtenId).toBe('user-1');
    });

    it('writes nothing but the preference, even when more is sent', async () => {
      // This is the real protection. The pipe runs without `whitelist`, so a
      // smuggled role reaches the handler — the handler simply never reads
      // it. Route this through the generic PATCH :id instead and a user
      // could promote themselves while changing their sport.
      await controller.changeSportPreference('clerk-1', {
        sportPreference: SportPreference.MARIO_KART,
        role: 'player',
        competitorId: 'someone-elses-id',
      } as Parameters<typeof controller.changeSportPreference>[1]);

      const [, patch] = usersService.update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(Object.keys(patch)).toEqual(['sportPreference']);
      expect(patch).not.toHaveProperty('role');
      expect(patch).not.toHaveProperty('competitorId');
    });
  });
});
