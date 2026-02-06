import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompetitorFormFields1770300000000
  implements MigrationInterface
{
  name = 'AddCompetitorFormFields1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add recentPositions column (simple-array stored as TEXT)
    await queryRunner.query(`
      ALTER TABLE "competitors"
      ADD COLUMN "recentPositions" text
    `);

    // Add formFactor column with default value of 1.0
    await queryRunner.query(`
      ALTER TABLE "competitors"
      ADD COLUMN "formFactor" float NOT NULL DEFAULT 1.0
    `);

    // Initialize recentPositions from the 5 most recent race results
    // Using a subquery to get positions as comma-separated string
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "recentPositions" = (
        SELECT string_agg(rr."rank12"::text, ',' ORDER BY r.date DESC)
        FROM (
          SELECT rr2."competitorId", rr2."rank12", rr2."raceId"
          FROM "race_results" rr2
          INNER JOIN "races" r2 ON r2.id = rr2."raceId"
          WHERE rr2."competitorId" = c.id::text
          ORDER BY r2.date DESC
          LIMIT 5
        ) rr
        INNER JOIN "races" r ON r.id = rr."raceId"
      )
      WHERE EXISTS (
        SELECT 1 FROM "race_results" WHERE "competitorId" = c.id::text
      )
    `);

    // Calculate and set formFactor based on weighted recent positions
    // Weights: [0.35, 0.25, 0.20, 0.12, 0.08] for positions 1-5 (most recent first)
    // Formula: score = sum((13 - position) * weight) → formFactor = 0.7 + (score/12) * 0.6
    await queryRunner.query(`
      UPDATE "competitors" c
      SET "formFactor" = CASE
        WHEN "recentPositions" IS NULL THEN 1.0
        WHEN "recentPositions" = '' THEN 1.0
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
            0.7  -- minimum
          ), 1.3) -- maximum
        )
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "competitors"
      DROP COLUMN "formFactor"
    `);

    await queryRunner.query(`
      ALTER TABLE "competitors"
      DROP COLUMN "recentPositions"
    `);
  }
}
