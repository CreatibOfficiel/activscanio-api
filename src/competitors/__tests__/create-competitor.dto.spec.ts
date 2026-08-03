import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCompetitorDto } from '../dtos/create-competitor.dto';

/**
 * Creating a competitor.
 *
 * This DTO demanded `mu` and `sigma` — TrueSkill vocabulary from before the
 * move to Glicko-2 — plus `rank`, `raceCount` and `avgRank12`, which are
 * computed from race history and cannot be known when someone is created.
 *
 * It never failed, because nothing ran it: the project had no global
 * ValidationPipe, so every class-validator decorator in the codebase was
 * decorative. Installing the pipe made this DTO real, and adding a
 * competitor started returning 400 with a list of complaints about fields
 * that no longer exist.
 *
 * Same options as the global pipe in main.ts: `whitelist` is off there, so
 * testing with it on would prove a protection production does not have.
 */
describe('CreateCompetitorDto', () => {
  async function errorsFor(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateCompetitorDto, payload);
    return validate(dto, { forbidUnknownValues: false });
  }

  /** What the onboarding and add-competitor screens actually send. */
  const REAL_PAYLOAD = {
    firstName: 'Marc',
    lastName: 'Dupont',
    rating: 1500,
    rd: 350,
    vol: 0.06,
    profilePictureUrl: 'https://cdn.test/marc.png',
    raceCount: 0,
    avgRank12: 0,
  };

  it('accepts what the app sends', async () => {
    expect(await errorsFor(REAL_PAYLOAD)).toHaveLength(0);
  });

  it('needs only a name', async () => {
    // Every rating column carries a database default, so a competitor can be
    // created from a name alone. Demanding more made the add screen
    // impossible to complete.
    expect(
      await errorsFor({ firstName: 'Marc', lastName: 'Dupont' }),
    ).toHaveLength(0);
  });

  it.each(['firstName', 'lastName'])('rejects a missing %s', async (field) => {
    const payload = { ...REAL_PAYLOAD };
    delete (payload as Record<string, unknown>)[field];

    expect((await errorsFor(payload)).length).toBeGreaterThan(0);
  });

  it('accepts an empty profile picture', async () => {
    // A competitor added by hand often has no photo. Requiring a valid URL
    // was one of the six complaints the add screen returned.
    expect(
      await errorsFor({ ...REAL_PAYLOAD, profilePictureUrl: '' }),
    ).toHaveLength(0);
  });

  it('still rejects a profile picture that is not a URL', async () => {
    expect(
      (await errorsFor({ ...REAL_PAYLOAD, profilePictureUrl: 'pas-une-url' }))
        .length,
    ).toBeGreaterThan(0);
  });

  it('no longer knows about mu or sigma', async () => {
    // The TrueSkill names. Sending the Glicko-2 ones must be enough.
    const errors = await errorsFor(REAL_PAYLOAD);
    const complained = errors.map((e) => e.property);

    expect(complained).not.toContain('mu');
    expect(complained).not.toContain('sigma');
  });

  it('does not demand computed statistics', async () => {
    // rank, raceCount and avgRank12 are derived from races. A competitor
    // being created has none.
    const errors = await errorsFor({ firstName: 'A', lastName: 'B' });
    const complained = errors.map((e) => e.property);

    for (const field of ['rank', 'raceCount', 'avgRank12']) {
      expect(complained).not.toContain(field);
    }
  });

  it('rejects a rating that is not a number', async () => {
    // Still typed where a value is given: a string rating would be stored
    // and then break every comparison downstream.
    expect(
      (await errorsFor({ ...REAL_PAYLOAD, rating: 'beaucoup' })).length,
    ).toBeGreaterThan(0);
  });
});
