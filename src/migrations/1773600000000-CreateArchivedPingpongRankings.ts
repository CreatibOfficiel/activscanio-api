import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ping-pong season archives.
 *
 * A separate table from `archived_competitor_rankings` rather than a `sport`
 * column on it: the two ratings sit on incomparable scales and the per-sport
 * stats share nothing (races and average finishing position on one side, sets
 * and win/loss on the other). Merging them would mean a table half of whose
 * columns are always null.
 *
 * Additive only — nothing on the Mario Kart side is altered, and the two new
 * counters on `season_archives` default to 0 so existing rows stay valid.
 */
export class CreateArchivedPingpongRankings1773600000000
  implements MigrationInterface
{
  name = 'CreateArchivedPingpongRankings1773600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "season_archives"
        ADD COLUMN IF NOT EXISTS "totalPingpongPlayers" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "totalPingpongMatches" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "archived_pingpong_rankings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "seasonArchiveId" uuid NOT NULL,
        "playerId" uuid NOT NULL,
        "playerName" character varying NOT NULL,
        "rank" integer,
        "provisional" boolean NOT NULL DEFAULT false,
        "finalRating" double precision NOT NULL,
        "finalRd" double precision NOT NULL,
        "finalVol" double precision NOT NULL,
        "totalMatches" integer NOT NULL,
        "wins" integer NOT NULL,
        "losses" integer NOT NULL,
        "setsWon" integer NOT NULL,
        "setsLost" integer NOT NULL,
        "bestStreak" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archived_pingpong_rankings" PRIMARY KEY ("id"),
        -- An unranked player is stored with rank NULL, so a rank that exists
        -- must be a real placement.
        CONSTRAINT "CHK_archived_pingpong_rank_positive"
          CHECK ("rank" IS NULL OR "rank" > 0)
      )
    `);

    // One row per player per season: a re-run of the archiving cron must not
    // silently double every standing.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_archived_pingpong_season_player"
        ON "archived_pingpong_rankings" ("seasonArchiveId", "playerId")
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_pingpong_rankings"
        ADD CONSTRAINT "FK_archived_pingpong_season"
        FOREIGN KEY ("seasonArchiveId")
        REFERENCES "season_archives"("id")
        ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "archived_pingpong_rankings"`,
    );
    await queryRunner.query(`
      ALTER TABLE "season_archives"
        DROP COLUMN IF EXISTS "totalPingpongPlayers",
        DROP COLUMN IF EXISTS "totalPingpongMatches"
    `);
  }
}
