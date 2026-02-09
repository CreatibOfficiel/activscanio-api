import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProvisionalToArchivedRankings1771000000000
  implements MigrationInterface
{
  name = 'AddProvisionalToArchivedRankings1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add provisional column
    await queryRunner.query(`
      ALTER TABLE "archived_competitor_rankings"
      ADD COLUMN "provisional" boolean NOT NULL DEFAULT false
    `);

    // Make rank nullable (calibrating players will have rank = NULL)
    await queryRunner.query(`
      ALTER TABLE "archived_competitor_rankings"
      ALTER COLUMN "rank" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Set rank to 0 for any NULL ranks before restoring NOT NULL
    await queryRunner.query(`
      UPDATE "archived_competitor_rankings"
      SET "rank" = 0
      WHERE "rank" IS NULL
    `);

    // Restore NOT NULL constraint on rank
    await queryRunner.query(`
      ALTER TABLE "archived_competitor_rankings"
      ALTER COLUMN "rank" SET NOT NULL
    `);

    // Remove provisional column
    await queryRunner.query(`
      ALTER TABLE "archived_competitor_rankings"
      DROP COLUMN "provisional"
    `);
  }
}
