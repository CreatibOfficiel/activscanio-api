import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes1770600000000 implements MigrationInterface {
  name = 'AddMissingIndexes1770600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index on race_results.competitorId (frequent filtering)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_race_results_competitorId"
      ON "race_results" ("competitorId")
    `);

    // Index on betting_weeks.status (WHERE status = 'open' queries)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_betting_weeks_status"
      ON "betting_weeks" ("status")
    `);

    // Composite index on bettor_rankings for leaderboard queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bettor_rankings_month_year_points"
      ON "bettor_rankings" ("month", "year", "totalPoints" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bettor_rankings_month_year_points"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_betting_weeks_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_race_results_competitorId"`,
    );
  }
}
