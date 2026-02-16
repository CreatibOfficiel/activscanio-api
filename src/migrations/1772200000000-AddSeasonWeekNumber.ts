import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonWeekNumber1772200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" ADD COLUMN IF NOT EXISTS "seasonWeekNumber" int NOT NULL DEFAULT 0`,
    );

    // Backfill: calibration weeks get 0, betting weeks get sequential 1, 2, 3...
    await queryRunner.query(`
      UPDATE "betting_weeks" AS bw
      SET "seasonWeekNumber" = COALESCE(sub.rn, 0)
      FROM (
        SELECT id,
          CASE
            WHEN "isCalibrationWeek" = true THEN 0
            ELSE ROW_NUMBER() OVER (
              PARTITION BY "isCalibrationWeek"
              ORDER BY "startDate"
            )
          END AS rn
        FROM "betting_weeks"
      ) AS sub
      WHERE bw.id = sub.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" DROP COLUMN "seasonWeekNumber"`,
    );
  }
}
