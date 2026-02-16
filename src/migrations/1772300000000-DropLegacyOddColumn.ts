import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyOddColumn1772300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make oddFirst NOT NULL (it replaces the old odd column)
    await queryRunner.query(`
      ALTER TABLE "competitor_odds"
        ALTER COLUMN "oddFirst" SET NOT NULL,
        ALTER COLUMN "oddSecond" SET NOT NULL,
        ALTER COLUMN "oddThird" SET NOT NULL
    `);

    // Drop the legacy column
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" DROP COLUMN IF EXISTS "odd"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the legacy column and populate from oddFirst
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" ADD COLUMN "odd" float`,
    );
    await queryRunner.query(
      `UPDATE "competitor_odds" SET "odd" = "oddFirst"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" ALTER COLUMN "odd" SET NOT NULL`,
    );

    // Revert oddFirst/oddSecond/oddThird to nullable
    await queryRunner.query(`
      ALTER TABLE "competitor_odds"
        ALTER COLUMN "oddFirst" DROP NOT NULL,
        ALTER COLUMN "oddSecond" DROP NOT NULL,
        ALTER COLUMN "oddThird" DROP NOT NULL
    `);
  }
}
