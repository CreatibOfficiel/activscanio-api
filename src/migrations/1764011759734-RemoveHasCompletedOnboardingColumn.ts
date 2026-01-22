import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveHasCompletedOnboardingColumn1764011759734
  implements MigrationInterface
{
  name = 'RemoveHasCompletedOnboardingColumn1764011759734';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove hasCompletedOnboarding column from users table
    // Now using dynamic getter based on role + competitorId
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "hasCompletedOnboarding"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore hasCompletedOnboarding column if rolling back
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "hasCompletedOnboarding" boolean NOT NULL DEFAULT false
    `);
  }
}
