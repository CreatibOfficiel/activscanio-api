import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotalLifetimeRaces1770200000000 implements MigrationInterface {
  name = 'AddTotalLifetimeRaces1770200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add totalLifetimeRaces column
    await queryRunner.query(`
      ALTER TABLE "competitors"
      ADD COLUMN "totalLifetimeRaces" integer NOT NULL DEFAULT 0
    `);

    // Initialize totalLifetimeRaces from existing race results count
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "totalLifetimeRaces" = (
        SELECT COUNT(*)
        FROM "race_results" rr
        WHERE rr."competitorId" = c.id::text
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "competitors"
      DROP COLUMN "totalLifetimeRaces"
    `);
  }
}
