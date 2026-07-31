import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the ping-pong module tables.
 *
 * Purely additive: nothing existing is touched, so this is safe to deploy
 * ahead of any code that writes to these tables.
 *
 * Two CHECK constraints are worth noting. They encode invariants the database
 * enforces itself rather than trusting the service layer: a match cannot have
 * the same player on both sides, and the winner must be one of the two
 * participants. Neither is expressible with a join-table shape, which is part
 * of why a match is a single row.
 */
export class CreatePingpong1773500000000 implements MigrationInterface {
  name = 'CreatePingpong1773500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pingpong_players" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "competitorId" uuid NOT NULL,
        "rating" double precision NOT NULL DEFAULT 1500,
        "rd" double precision NOT NULL DEFAULT 350,
        "vol" double precision NOT NULL DEFAULT 0.06,
        "matchCount" integer NOT NULL DEFAULT 0,
        "weightedMatchCount" double precision NOT NULL DEFAULT 0,
        "wins" integer NOT NULL DEFAULT 0,
        "losses" integer NOT NULL DEFAULT 0,
        "setsWon" integer NOT NULL DEFAULT 0,
        "setsLost" integer NOT NULL DEFAULT 0,
        "currentStreak" integer NOT NULL DEFAULT 0,
        "bestStreak" integer NOT NULL DEFAULT 0,
        "lastMatchAt" TIMESTAMP WITH TIME ZONE,
        "lastDecayAt" TIMESTAMP WITH TIME ZONE,
        "isRankingEligible" boolean NOT NULL DEFAULT false,
        "distinctOpponents21d" integer NOT NULL DEFAULT 0,
        "diversityScore21d" double precision NOT NULL DEFAULT 0,
        "previousDayRank" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pingpong_players" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "pingpong_players"
      ADD CONSTRAINT "FK_pingpong_players_competitor"
      FOREIGN KEY ("competitorId") REFERENCES "competitors"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_pingpong_players_competitor"
      ON "pingpong_players" ("competitorId")
    `);

    await queryRunner.query(`
      CREATE TABLE "pingpong_matches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "playerAId" uuid NOT NULL,
        "playerBId" uuid NOT NULL,
        "winnerId" uuid NOT NULL,
        "sets" jsonb NOT NULL,
        "setsA" integer NOT NULL,
        "setsB" integer NOT NULL,
        "playedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "pairKey" character varying NOT NULL,
        "isoYear" integer NOT NULL,
        "isoWeek" integer NOT NULL,
        "appliedWeight" double precision NOT NULL,
        "ratingFrozen" boolean NOT NULL DEFAULT false,
        "ratingABefore" double precision NOT NULL,
        "ratingAAfter" double precision NOT NULL,
        "rdABefore" double precision NOT NULL,
        "rdAAfter" double precision NOT NULL,
        "ratingBBefore" double precision NOT NULL,
        "ratingBAfter" double precision NOT NULL,
        "rdBBefore" double precision NOT NULL,
        "rdBAfter" double precision NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pingpong_matches" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_pingpong_distinct_players" CHECK ("playerAId" <> "playerBId"),
        CONSTRAINT "CHK_pingpong_winner_played" CHECK ("winnerId" = "playerAId" OR "winnerId" = "playerBId"),
        CONSTRAINT "CHK_pingpong_weight_range" CHECK ("appliedWeight" >= 0 AND "appliedWeight" <= 1)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "pingpong_matches"
      ADD CONSTRAINT "FK_pingpong_matches_playerA"
      FOREIGN KEY ("playerAId") REFERENCES "pingpong_players"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "pingpong_matches"
      ADD CONSTRAINT "FK_pingpong_matches_playerB"
      FOREIGN KEY ("playerBId") REFERENCES "pingpong_players"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pingpong_matches_pair_week"
      ON "pingpong_matches" ("pairKey", "isoYear", "isoWeek")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pingpong_matches_playerA"
      ON "pingpong_matches" ("playerAId", "playedAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pingpong_matches_playerB"
      ON "pingpong_matches" ("playerBId", "playedAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pingpong_matches_played_at"
      ON "pingpong_matches" ("playedAt" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "pingpong_elo_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "playerId" uuid NOT NULL,
        "date" date NOT NULL,
        "rating" double precision NOT NULL,
        "rd" double precision NOT NULL,
        "vol" double precision NOT NULL,
        "matchCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pingpong_elo_snapshots" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "pingpong_elo_snapshots"
      ADD CONSTRAINT "FK_pingpong_snapshots_player"
      FOREIGN KEY ("playerId") REFERENCES "pingpong_players"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_pingpong_snapshots_player_date"
      ON "pingpong_elo_snapshots" ("playerId", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pingpong_elo_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pingpong_matches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pingpong_players"`);
  }
}
