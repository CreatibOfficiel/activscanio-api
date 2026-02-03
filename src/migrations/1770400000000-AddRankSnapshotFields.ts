import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRankSnapshotFields1770400000000 implements MigrationInterface {
  name = 'AddRankSnapshotFields1770400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add previousDayRank column to competitors table
    await queryRunner.query(`
      ALTER TABLE "competitors"
      ADD COLUMN "previousDayRank" integer
    `);

    // Add previousWeekRank column to bettor_rankings table
    await queryRunner.query(`
      ALTER TABLE "bettor_rankings"
      ADD COLUMN "previousWeekRank" integer
    `);

    // Initialize previousDayRank with current ranks based on conservativeScore
    // This ensures we have initial data for trend calculation
    await queryRunner.query(`
      WITH ranked_competitors AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY (rating - 2 * rd) DESC) as current_rank
        FROM competitors
        WHERE "raceCount" > 0
      )
      UPDATE competitors c
      SET "previousDayRank" = rc.current_rank::integer
      FROM ranked_competitors rc
      WHERE c.id = rc.id
    `);

    // Initialize previousWeekRank with current ranks based on totalPoints
    await queryRunner.query(`
      WITH ranked_bettors AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY month, year
            ORDER BY "totalPoints" DESC
          ) as current_rank
        FROM bettor_rankings
      )
      UPDATE bettor_rankings br
      SET "previousWeekRank" = rb.current_rank::integer
      FROM ranked_bettors rb
      WHERE br.id = rb.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bettor_rankings"
      DROP COLUMN "previousWeekRank"
    `);

    await queryRunner.query(`
      ALTER TABLE "competitors"
      DROP COLUMN "previousDayRank"
    `);
  }
}
