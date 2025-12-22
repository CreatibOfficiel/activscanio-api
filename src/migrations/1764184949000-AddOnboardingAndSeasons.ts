import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingAndSeasons1764184949000
  implements MigrationInterface
{
  name = 'AddOnboardingAndSeasons1764184949000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ====================
    // 1. CREATE SEASON_ARCHIVES TABLE
    // ====================
    await queryRunner.query(`
            CREATE TABLE "season_archives" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "month" integer NOT NULL,
                "year" integer NOT NULL,
                "seasonName" character varying,
                "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
                "endDate" TIMESTAMP WITH TIME ZONE NOT NULL,
                "archivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "totalCompetitors" integer NOT NULL,
                "totalBettors" integer NOT NULL,
                "totalRaces" integer NOT NULL,
                "totalBets" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_season_archives" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_season_archives_month_year" UNIQUE ("month", "year")
            )
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_season_archives_month_year" ON "season_archives" ("month", "year")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_season_archives_year" ON "season_archives" ("year")
        `);

    // ====================
    // 2. CREATE ARCHIVED_COMPETITOR_RANKINGS TABLE
    // ====================
    await queryRunner.query(`
            CREATE TABLE "archived_competitor_rankings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "seasonArchiveId" uuid NOT NULL,
                "competitorId" uuid NOT NULL,
                "competitorName" character varying NOT NULL,
                "rank" integer NOT NULL,
                "finalRating" double precision NOT NULL,
                "finalRd" double precision NOT NULL,
                "finalVol" double precision NOT NULL,
                "totalRaces" integer NOT NULL,
                "winStreak" integer NOT NULL,
                "avgRank12" double precision NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_archived_competitor_rankings" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_archived_competitor_rankings" UNIQUE ("seasonArchiveId", "competitorId")
            )
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_archived_competitor_rankings_season" ON "archived_competitor_rankings" ("seasonArchiveId")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_archived_competitor_rankings_competitor" ON "archived_competitor_rankings" ("competitorId")
        `);

    // Add foreign key for archived_competitor_rankings → season_archives
    await queryRunner.query(`
            ALTER TABLE "archived_competitor_rankings"
            ADD CONSTRAINT "FK_archived_competitor_rankings_season"
            FOREIGN KEY ("seasonArchiveId") REFERENCES "season_archives"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

    // ====================
    // 3. ADD COLUMNS TO USERS TABLE
    // ====================
    await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "lastBoostUsedMonth" integer
        `);

    await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "lastBoostUsedYear" integer
        `);

    await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "hasCompletedOnboarding" boolean NOT NULL DEFAULT false
        `);

    // Index for boost tracking queries
    await queryRunner.query(`
            CREATE INDEX "IDX_users_boost_tracking" ON "users" ("lastBoostUsedMonth", "lastBoostUsedYear")
        `);

    // Unique partial index to prevent two users from linking the same competitor
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_users_competitor_id_unique"
            ON "users" ("competitorId")
            WHERE "competitorId" IS NOT NULL
        `);

    // ====================
    // 4. ADD SEASONARCHIVEID TO BETTING_WEEKS TABLE
    // ====================
    await queryRunner.query(`
            ALTER TABLE "betting_weeks" ADD COLUMN "seasonArchiveId" uuid
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_betting_weeks_season" ON "betting_weeks" ("seasonArchiveId")
        `);

    // Add foreign key for betting_weeks → season_archives
    await queryRunner.query(`
            ALTER TABLE "betting_weeks"
            ADD CONSTRAINT "FK_betting_weeks_season"
            FOREIGN KEY ("seasonArchiveId") REFERENCES "season_archives"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);

    // ====================
    // 5. ADD INDEXES TO BETTOR_RANKINGS FOR HISTORICAL QUERIES
    // ====================
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_bettor_rankings_year_month"
            ON "bettor_rankings" ("year", "month")
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_bettor_rankings_rank"
            ON "bettor_rankings" ("rank")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ====================
    // REVERSE ORDER: Remove indexes and foreign keys first
    // ====================

    // Remove indexes from bettor_rankings
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_bettor_rankings_rank"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_bettor_rankings_year_month"`,
    );

    // Remove foreign key and column from betting_weeks
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" DROP CONSTRAINT IF EXISTS "FK_betting_weeks_season"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_betting_weeks_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" DROP COLUMN "seasonArchiveId"`,
    );

    // Remove indexes and columns from users
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_users_competitor_id_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_users_boost_tracking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "hasCompletedOnboarding"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "lastBoostUsedYear"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "lastBoostUsedMonth"`,
    );

    // Drop archived_competitor_rankings table (with foreign key)
    await queryRunner.query(
      `ALTER TABLE "archived_competitor_rankings" DROP CONSTRAINT IF EXISTS "FK_archived_competitor_rankings_season"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_archived_competitor_rankings_competitor"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_archived_competitor_rankings_season"`,
    );
    await queryRunner.query(`DROP TABLE "archived_competitor_rankings"`);

    // Drop season_archives table
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_season_archives_year"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_season_archives_month_year"`,
    );
    await queryRunner.query(`DROP TABLE "season_archives"`);
  }
}
