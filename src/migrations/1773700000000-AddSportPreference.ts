import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which sport each user follows.
 *
 * A separate column rather than a fourth value on `role`, which already means
 * three things at once (onboarding stage, competitor status, and a legacy
 * betting distinction).
 *
 * Existing rows default to 'both'. They predate the choice, and showing
 * someone a sport they can ignore is a smaller wrong than hiding one they
 * already play — the opposite default would silently empty the Mario Kart
 * leaderboard for every current user.
 */
export class AddSportPreference1773700000000 implements MigrationInterface {
  name = 'AddSportPreference1773700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "sportPreference" character varying
        NOT NULL DEFAULT 'both'
    `);

    // Guard the three known values at the database level: the column is a
    // varchar, so a typo in a DTO would otherwise store silently and then
    // match no branch in the UI.
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_sport_preference"
        CHECK ("sportPreference" IN ('mario-kart', 'ping-pong', 'both'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_sport_preference"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "sportPreference"
    `);
  }
}
