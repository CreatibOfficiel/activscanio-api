import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifetimeAvgRankAndRelativeForm1771100000000
  implements MigrationInterface
{
  name = 'AddLifetimeAvgRankAndRelativeForm1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add lifetimeAvgRank column
    await queryRunner.query(`
      ALTER TABLE "competitors"
      ADD COLUMN "lifetimeAvgRank" float NOT NULL DEFAULT 0
    `);

    // 2. Backfill lifetimeAvgRank from race_results history
    // Note: competitorId was converted to uuid by migration 1770600000001
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "lifetimeAvgRank" = COALESCE(
        (SELECT AVG(rr."rank12"::float) FROM "race_results" rr WHERE rr."competitorId" = c.id),
        0
      )
    `);

    // 3. Recalculate formFactor using the new relative formula:
    //    weighted recent rank vs lifetimeAvgRank baseline
    //    formFactor = 1.0 - (weightedRank - baseline) / 10, clamped [0.7, 1.3]
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "formFactor" = CASE
        WHEN "recentPositions" IS NULL OR "recentPositions" = '' THEN 1.0
        ELSE (
          SELECT LEAST(GREATEST(
            1.0 - (weighted_rank - baseline) / 10.0,
            0.7
          ), 1.3)
          FROM (
            SELECT
              CASE
                WHEN total_weight > 0 AND total_weight < 1 THEN raw_weighted / total_weight
                ELSE raw_weighted
              END AS weighted_rank,
              CASE
                WHEN c."lifetimeAvgRank" > 0 THEN c."lifetimeAvgRank"
                ELSE 6.5
              END AS baseline
            FROM (
              SELECT
                SUM(pos.rank * pos.weight) AS raw_weighted,
                SUM(pos.weight) AS total_weight
              FROM (
                SELECT
                  unnest(string_to_array(c."recentPositions", ','))::float AS rank,
                  unnest(ARRAY[0.35, 0.25, 0.20, 0.12, 0.08]) AS weight
              ) pos
              WHERE pos.rank IS NOT NULL
            ) weighted
          ) calc
        )
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert formFactor to old absolute formula
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "formFactor" = CASE
        WHEN "recentPositions" IS NULL OR "recentPositions" = '' THEN 1.0
        ELSE (
          SELECT LEAST(GREATEST(
            0.7 + (
              COALESCE(
                (
                  SELECT SUM((13 - pos.rank::float) * pos.weight)
                  FROM (
                    SELECT
                      unnest(string_to_array(c."recentPositions", ','))::int as rank,
                      unnest(ARRAY[0.35, 0.25, 0.20, 0.12, 0.08]) as weight
                  ) pos
                  WHERE pos.rank IS NOT NULL
                ), 0
              ) / 12.0
            ) * 0.6,
            0.7
          ), 1.3)
        )
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "competitors"
      DROP COLUMN "lifetimeAvgRank"
    `);
  }
}
