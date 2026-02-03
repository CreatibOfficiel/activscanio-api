import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalibrationWeekSupport1770200000001
  implements MigrationInterface
{
  name = 'AddCalibrationWeekSupport1770200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'calibration' to the betting_week_status enum
    await queryRunner.query(`
      ALTER TYPE "betting_week_status_enum" ADD VALUE IF NOT EXISTS 'calibration' BEFORE 'open'
    `);

    // Add isCalibrationWeek column
    await queryRunner.query(`
      ALTER TABLE "betting_weeks"
      ADD COLUMN "isCalibrationWeek" boolean NOT NULL DEFAULT false
    `);

    // Mark existing first weeks of each month as calibration weeks
    // (retrospectively, for data consistency)
    await queryRunner.query(`
      UPDATE "betting_weeks"
      SET "isCalibrationWeek" = true
      WHERE EXTRACT(DAY FROM "startDate") <= 7
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove isCalibrationWeek column
    await queryRunner.query(`
      ALTER TABLE "betting_weeks"
      DROP COLUMN "isCalibrationWeek"
    `);

    // Note: PostgreSQL doesn't support removing enum values easily
    // The 'calibration' enum value will remain but won't be used
  }
}
