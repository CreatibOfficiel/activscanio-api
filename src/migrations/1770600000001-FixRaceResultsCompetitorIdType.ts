import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix race_results.competitorId:
 * 1. Cast from varchar to uuid to match competitors.id type
 * 2. Add foreign key constraint for referential integrity
 *
 * Prerequisites: all existing competitorId values must be valid UUIDs
 * that exist in the competitors table.
 */
export class FixRaceResultsCompetitorIdType1770600000001
  implements MigrationInterface
{
  name = 'FixRaceResultsCompetitorIdType1770600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Verify all existing values are valid UUIDs that exist in competitors
    const orphans = await queryRunner.query(`
      SELECT rr.id, rr."competitorId"
      FROM race_results rr
      WHERE NOT EXISTS (
        SELECT 1 FROM competitors c WHERE c.id::text = rr."competitorId"
      )
      LIMIT 5
    `);

    if (orphans.length > 0) {
      throw new Error(
        `Cannot migrate: found ${orphans.length} race_results with invalid competitorId. ` +
        `First: ${JSON.stringify(orphans[0])}. Fix data before retrying.`,
      );
    }

    // Step 2: Change column type from varchar to uuid
    await queryRunner.query(`
      ALTER TABLE "race_results"
      ALTER COLUMN "competitorId" TYPE uuid USING "competitorId"::uuid
    `);

    // Step 3: Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "race_results"
      ADD CONSTRAINT "FK_race_results_competitorId"
      FOREIGN KEY ("competitorId") REFERENCES "competitors"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK
    await queryRunner.query(`
      ALTER TABLE "race_results"
      DROP CONSTRAINT IF EXISTS "FK_race_results_competitorId"
    `);

    // Revert column type to varchar
    await queryRunner.query(`
      ALTER TABLE "race_results"
      ALTER COLUMN "competitorId" TYPE character varying USING "competitorId"::text
    `);
  }
}
