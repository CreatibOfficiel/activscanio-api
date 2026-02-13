import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateTopTenToTopFive1771900000000 implements MigrationInterface {
  name = 'UpdateTopTenToTopFive1771900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update the achievement definition: Top 10 → Top 5
    await queryRunner.query(`
      UPDATE "achievements"
      SET
        "name" = 'Top 5',
        "description" = 'Terminer dans le top 5 mensuel',
        "condition" = jsonb_set("condition", '{value}', '5')
      WHERE "key" = 'top_ten'
    `);

    // Revoke user_achievements for users who had top 10 but wouldn't qualify for top 5
    // We check bettor_rankings to see if they ever actually finished in top 5
    await queryRunner.query(`
      UPDATE "user_achievements"
      SET
        "revokedAt" = NOW(),
        "revocationReason" = 'Achievement criteria changed from top 10 to top 5'
      WHERE "achievementId" IN (
        SELECT "id" FROM "achievements" WHERE "key" = 'top_ten'
      )
      AND "revokedAt" IS NULL
      AND "userId" NOT IN (
        SELECT DISTINCT br."userId"
        FROM "bettor_rankings" br
        WHERE br."rank" IS NOT NULL AND br."rank" <= 5
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the achievement definition: Top 5 → Top 10
    await queryRunner.query(`
      UPDATE "achievements"
      SET
        "name" = 'Top 10',
        "description" = 'Terminer dans le top 10 mensuel',
        "condition" = jsonb_set("condition", '{value}', '10')
      WHERE "key" = 'top_ten'
    `);

    // Un-revoke the previously revoked achievements
    await queryRunner.query(`
      UPDATE "user_achievements"
      SET
        "revokedAt" = NULL,
        "revocationReason" = NULL
      WHERE "achievementId" IN (
        SELECT "id" FROM "achievements" WHERE "key" = 'top_ten'
      )
      AND "revocationReason" = 'Achievement criteria changed from top 10 to top 5'
    `);
  }
}
