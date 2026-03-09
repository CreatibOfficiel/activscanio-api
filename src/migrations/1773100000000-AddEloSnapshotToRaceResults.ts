import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add before/after ELO snapshot columns to race_results.
 * Stores the full Glicko-2 state (rating, rd, vol) before and after each race,
 * enabling easy debugging and recalculation without relying on daily snapshots.
 */
export class AddEloSnapshotToRaceResults1773100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_results"
        ADD COLUMN "ratingBefore" float,
        ADD COLUMN "rdBefore" float,
        ADD COLUMN "volBefore" float,
        ADD COLUMN "ratingAfter" float,
        ADD COLUMN "rdAfter" float,
        ADD COLUMN "volAfter" float
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_results"
        DROP COLUMN "ratingBefore",
        DROP COLUMN "rdBefore",
        DROP COLUMN "volBefore",
        DROP COLUMN "ratingAfter",
        DROP COLUMN "rdAfter",
        DROP COLUMN "volAfter"
    `);
  }
}
