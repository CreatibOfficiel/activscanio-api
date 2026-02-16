import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonWeekNumber1772200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" ADD COLUMN "seasonWeekNumber" int NOT NULL DEFAULT 1`,
    );

    // Backfill existing rows: assign sequential numbers ordered by startDate
    await queryRunner.query(`
      UPDATE "betting_weeks" AS bw
      SET "seasonWeekNumber" = sub.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "startDate") AS rn
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
