import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompetitorEloSnapshots1771600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create table
    await queryRunner.query(`
      CREATE TABLE "competitor_elo_snapshots" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "competitorId" uuid NOT NULL,
        "date" date NOT NULL,
        "rating" float NOT NULL,
        "rd" float NOT NULL,
        "vol" float NOT NULL,
        "raceCount" int NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_competitor_elo_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_competitor_elo_snapshots_competitor" FOREIGN KEY ("competitorId")
          REFERENCES "competitors"("id") ON DELETE CASCADE
      )
    `);

    // 2. Unique index for dedup (also used by ON CONFLICT)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_competitor_elo_snapshots_competitor_date"
        ON "competitor_elo_snapshots" ("competitorId", "date")
    `);

    // 3. Lookup index for queries ordered by date DESC
    await queryRunner.query(`
      CREATE INDEX "IDX_competitor_elo_snapshots_competitor_date_desc"
        ON "competitor_elo_snapshots" ("competitorId", "date" DESC)
    `);

    // 4. Backfill from competitor_monthly_stats (use last day of that month as date)
    await queryRunner.query(`
      INSERT INTO "competitor_elo_snapshots" ("competitorId", "date", "rating", "rd", "vol", "raceCount")
      SELECT
        cms."competitorId",
        (make_date(cms."year", cms."month", 1) + interval '1 month' - interval '1 day')::date AS "date",
        cms."finalRating" AS "rating",
        cms."finalRd" AS "rd",
        cms."finalVol" AS "vol",
        cms."raceCount"
      FROM "competitor_monthly_stats" cms
      ON CONFLICT ("competitorId", "date") DO NOTHING
    `);

    // 5. Backfill current values from competitors for today
    await queryRunner.query(`
      INSERT INTO "competitor_elo_snapshots" ("competitorId", "date", "rating", "rd", "vol", "raceCount")
      SELECT
        c."id" AS "competitorId",
        CURRENT_DATE AS "date",
        c."rating",
        c."rd",
        c."vol",
        c."raceCount"
      FROM "competitors" c
      ON CONFLICT ("competitorId", "date") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_competitor_elo_snapshots_competitor_date_desc"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_competitor_elo_snapshots_competitor_date"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "competitor_elo_snapshots"`);
  }
}
