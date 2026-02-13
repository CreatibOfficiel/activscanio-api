import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotalWinsColumn1771800000000 implements MigrationInterface {
  name = 'AddTotalWinsColumn1771800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add totalWins column
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "totalWins" integer NOT NULL DEFAULT 0`,
    );

    // Backfill from historical race results
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "totalWins" = sub.wins
      FROM (
        SELECT rr."competitorId", COUNT(*) as wins
        FROM "race_results" rr
        WHERE rr."rank12" = 1
        GROUP BY rr."competitorId"
      ) sub
      WHERE c.id = sub."competitorId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "totalWins"`,
    );
  }
}
