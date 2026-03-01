import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonNumbers1772900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // Part 1: Add seasonNumber columns
    // ============================================================

    await queryRunner.query(
      `ALTER TABLE betting_weeks ADD COLUMN "seasonNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE bettor_rankings ADD COLUMN "seasonNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE competitor_monthly_stats ADD COLUMN "seasonNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE season_archives ADD COLUMN "seasonNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN "lastBoostUsedSeason" integer`,
    );

    // ============================================================
    // Part 2: Backfill seasonNumber from existing data
    // ============================================================

    // betting_weeks: exact calculation from weekNumber
    // seasonNumber = LEAST(CEIL(weekNumber / 4), 13)
    await queryRunner.query(`
      UPDATE betting_weeks
      SET "seasonNumber" = LEAST(CEIL("weekNumber"::numeric / 4), 13)
    `);

    // bettor_rankings: map month -> season for historical data
    await queryRunner.query(`
      UPDATE bettor_rankings SET "seasonNumber" = "month"
    `);

    // competitor_monthly_stats: map month -> season for historical data
    await queryRunner.query(`
      UPDATE competitor_monthly_stats SET "seasonNumber" = "month"
    `);

    // season_archives: map month -> season for historical data
    await queryRunner.query(`
      UPDATE season_archives SET "seasonNumber" = "month"
    `);

    // ============================================================
    // Part 3: Set NOT NULL after backfill
    // ============================================================

    await queryRunner.query(`
      ALTER TABLE betting_weeks ALTER COLUMN "seasonNumber" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE bettor_rankings ALTER COLUMN "seasonNumber" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE competitor_monthly_stats ALTER COLUMN "seasonNumber" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE season_archives ALTER COLUMN "seasonNumber" SET NOT NULL
    `);

    // ============================================================
    // Part 4: Drop old unique indexes, create new ones
    // ============================================================

    // bettor_rankings: old unique on (userId, month, year) -> new on (userId, seasonNumber, year)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dd368bd01aa2c044c24a299fb4"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_bettor_ranking_user_season_year"
      ON bettor_rankings ("userId", "seasonNumber", "year")
    `);

    // competitor_monthly_stats: old unique on (competitorId, month, year) -> new on (competitorId, seasonNumber, year)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_da9bddbe281bac01cd607a6114"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_comp_monthly_stats_season_year"
      ON competitor_monthly_stats ("competitorId", "seasonNumber", "year")
    `);

    // season_archives: old unique constraint + index -> new unique on (seasonNumber, year)
    await queryRunner.query(`
      ALTER TABLE season_archives DROP CONSTRAINT IF EXISTS "UQ_season_archives_month_year"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_season_archives_month_year"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_season_archives_season_year"
      ON season_archives ("seasonNumber", "year")
    `);

    // Update the bettor_rankings performance index to use seasonNumber
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bettor_rankings_month_year_points"`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_bettor_rankings_season_year_points"
      ON bettor_rankings ("seasonNumber", "year", "totalPoints" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bettor_rankings_season_year_points"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_season_archives_season_year"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_comp_monthly_stats_season_year"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bettor_ranking_user_season_year"`,
    );

    // Restore old indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_dd368bd01aa2c044c24a299fb4"
      ON bettor_rankings ("userId", "month", "year")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_da9bddbe281bac01cd607a6114"
      ON competitor_monthly_stats ("competitorId", "month", "year")
    `);
    await queryRunner.query(`
      ALTER TABLE season_archives
      ADD CONSTRAINT "UQ_season_archives_month_year" UNIQUE ("month", "year")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_season_archives_month_year"
      ON season_archives ("month", "year")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bettor_rankings_month_year_points"
      ON bettor_rankings ("month", "year", "totalPoints" DESC)
    `);

    // Drop new columns
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN "lastBoostUsedSeason"`,
    );
    await queryRunner.query(
      `ALTER TABLE season_archives DROP COLUMN "seasonNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE competitor_monthly_stats DROP COLUMN "seasonNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE bettor_rankings DROP COLUMN "seasonNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE betting_weeks DROP COLUMN "seasonNumber"`,
    );
  }
}
