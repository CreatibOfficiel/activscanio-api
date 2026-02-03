import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPositionOdds1770124579289 implements MigrationInterface {
  name = 'AddPositionOdds1770124579289';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add position-specific odds columns
    await queryRunner.query(`
      ALTER TABLE "competitor_odds"
      ADD COLUMN "oddFirst" float,
      ADD COLUMN "oddSecond" float,
      ADD COLUMN "oddThird" float
    `);

    // Initialize position odds from existing odd values
    // Using position factors: first = 0.33, second = 0.35, third = 0.32
    // These make oddFirst higher than oddSecond higher than oddThird
    await queryRunner.query(`
      UPDATE "competitor_odds"
      SET
        "oddFirst" = LEAST(50, GREATEST(1.1, "odd" / 0.33)),
        "oddSecond" = LEAST(50, GREATEST(1.1, "odd" / 0.35)),
        "oddThird" = LEAST(50, GREATEST(1.1, "odd" / 0.32))
      WHERE "oddFirst" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "competitor_odds"
      DROP COLUMN "oddFirst",
      DROP COLUMN "oddSecond",
      DROP COLUMN "oddThird"
    `);
  }
}
