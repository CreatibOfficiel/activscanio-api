import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBettingSystemCorrect1764011759733
  implements MigrationInterface
{
  name = 'AddBettingSystemCorrect1764011759733';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns to existing competitors table
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "currentMonthRaceCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "isActiveThisWeek" boolean NOT NULL DEFAULT false`,
    );

    // Add new columns to existing races table
    await queryRunner.query(`ALTER TABLE "races" ADD "month" integer`);
    await queryRunner.query(`ALTER TABLE "races" ADD "year" integer`);
    await queryRunner.query(`ALTER TABLE "races" ADD "bettingWeekId" uuid`);

    // Create users table
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('spectator', 'competitor', 'both')`,
    );
    await queryRunner.query(`CREATE TABLE "users" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "clerkId" character varying NOT NULL,
            "email" character varying NOT NULL,
            "firstName" character varying NOT NULL,
            "lastName" character varying NOT NULL,
            "profilePictureUrl" character varying,
            "role" "public"."users_role_enum" NOT NULL DEFAULT 'spectator',
            "competitorId" uuid,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "UQ_b0e4d1eb939d0387788678c4f8e" UNIQUE ("clerkId"),
            CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_b0e4d1eb939d0387788678c4f8" ON "users" ("clerkId")`,
    );

    // Create betting_weeks table
    await queryRunner.query(
      `CREATE TYPE "public"."betting_weeks_status_enum" AS ENUM('open', 'closed', 'finalized')`,
    );
    await queryRunner.query(`CREATE TABLE "betting_weeks" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "weekNumber" integer NOT NULL,
            "year" integer NOT NULL,
            "month" integer NOT NULL,
            "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
            "endDate" TIMESTAMP WITH TIME ZONE NOT NULL,
            "status" "public"."betting_weeks_status_enum" NOT NULL DEFAULT 'open',
            "podiumFirstId" uuid,
            "podiumSecondId" uuid,
            "podiumThirdId" uuid,
            "finalizedAt" TIMESTAMP WITH TIME ZONE,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_c51f0555dded57045e4176c0fb6" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_09d581ae84c91a4cf77bd40b7d" ON "betting_weeks" ("year", "weekNumber")`,
    );

    // Create bets table
    await queryRunner.query(`CREATE TABLE "bets" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "userId" uuid NOT NULL,
            "bettingWeekId" uuid NOT NULL,
            "placedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "isFinalized" boolean NOT NULL DEFAULT false,
            "pointsEarned" double precision,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_7ca91a6a39623bd5c21722bcedd" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0062d2cd91ee2eb77221ac850f" ON "bets" ("userId", "bettingWeekId")`,
    );

    // Create bet_picks table
    await queryRunner.query(
      `CREATE TYPE "public"."bet_picks_position_enum" AS ENUM('first', 'second', 'third')`,
    );
    await queryRunner.query(`CREATE TABLE "bet_picks" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "betId" uuid NOT NULL,
            "competitorId" uuid NOT NULL,
            "position" "public"."bet_picks_position_enum" NOT NULL,
            "oddAtBet" double precision NOT NULL,
            "hasBoost" boolean NOT NULL DEFAULT false,
            "isCorrect" boolean,
            "pointsEarned" double precision,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_0b4eb2f7deaf7ddec854a8f63c3" PRIMARY KEY ("id")
        )`);

    // Create competitor_odds table
    await queryRunner.query(`CREATE TABLE "competitor_odds" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "competitorId" uuid NOT NULL,
            "bettingWeekId" uuid NOT NULL,
            "odd" double precision NOT NULL,
            "calculatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "metadata" jsonb,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_a3f8661531d022dc4c3876a3f5c" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_e3cbbd88902571073cd611b10c" ON "competitor_odds" ("competitorId", "bettingWeekId", "calculatedAt")`,
    );

    // Create bettor_rankings table
    await queryRunner.query(`CREATE TABLE "bettor_rankings" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "userId" uuid NOT NULL,
            "month" integer NOT NULL,
            "year" integer NOT NULL,
            "totalPoints" double precision NOT NULL DEFAULT '0',
            "betsPlaced" integer NOT NULL DEFAULT '0',
            "betsWon" integer NOT NULL DEFAULT '0',
            "perfectBets" integer NOT NULL DEFAULT '0',
            "boostsUsed" integer NOT NULL DEFAULT '0',
            "rank" integer,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_89e117e5150823872dff785b91d" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dd368bd01aa2c044c24a299fb4" ON "bettor_rankings" ("userId", "month", "year")`,
    );

    // Create competitor_monthly_stats table
    await queryRunner.query(`CREATE TABLE "competitor_monthly_stats" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "competitorId" uuid NOT NULL,
            "month" integer NOT NULL,
            "year" integer NOT NULL,
            "finalRating" double precision NOT NULL,
            "finalRd" double precision NOT NULL,
            "finalVol" double precision NOT NULL,
            "raceCount" integer NOT NULL,
            "winStreak" integer NOT NULL,
            "avgRank12" double precision NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_9aea8530ac79bba4672ac409fb5" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_da9bddbe281bac01cd607a6114" ON "competitor_monthly_stats" ("competitorId", "month", "year")`,
    );

    // Add foreign keys
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_e902b09a4e164b925d206ba3990" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" ADD CONSTRAINT "FK_cc2c51ed4da1b5899f46197f5dd" FOREIGN KEY ("podiumFirstId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" ADD CONSTRAINT "FK_9cebf86f47d68307a5e9f2c54d0" FOREIGN KEY ("podiumSecondId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" ADD CONSTRAINT "FK_11764732d5d09ac7627cd275a94" FOREIGN KEY ("podiumThirdId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bets" ADD CONSTRAINT "FK_ca8cf669d26fbfcc365a4811b22" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bets" ADD CONSTRAINT "FK_ce1494304f92cfe6406e81ac35d" FOREIGN KEY ("bettingWeekId") REFERENCES "betting_weeks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bet_picks" ADD CONSTRAINT "FK_6843307d0c5bf8833e9e8edab4f" FOREIGN KEY ("betId") REFERENCES "bets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bet_picks" ADD CONSTRAINT "FK_1494514eed26d2026d1c155e9d3" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" ADD CONSTRAINT "FK_6f701d73cb24cb7155b553211e2" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" ADD CONSTRAINT "FK_f55d70468c24bd719627c81ffe8" FOREIGN KEY ("bettingWeekId") REFERENCES "betting_weeks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bettor_rankings" ADD CONSTRAINT "FK_1907120b88c19732a0b543a97fc" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_monthly_stats" ADD CONSTRAINT "FK_9f68d5eb588b5ed6b52ae7db112" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "races" ADD CONSTRAINT "FK_f93b8a35afbdb9a970d3beb321d" FOREIGN KEY ("bettingWeekId") REFERENCES "betting_weeks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign keys
    await queryRunner.query(
      `ALTER TABLE "races" DROP CONSTRAINT "FK_f93b8a35afbdb9a970d3beb321d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_monthly_stats" DROP CONSTRAINT "FK_9f68d5eb588b5ed6b52ae7db112"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bettor_rankings" DROP CONSTRAINT "FK_1907120b88c19732a0b543a97fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" DROP CONSTRAINT "FK_f55d70468c24bd719627c81ffe8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitor_odds" DROP CONSTRAINT "FK_6f701d73cb24cb7155b553211e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bet_picks" DROP CONSTRAINT "FK_1494514eed26d2026d1c155e9d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bet_picks" DROP CONSTRAINT "FK_6843307d0c5bf8833e9e8edab4f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bets" DROP CONSTRAINT "FK_ce1494304f92cfe6406e81ac35d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bets" DROP CONSTRAINT "FK_ca8cf669d26fbfcc365a4811b22"`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" DROP CONSTRAINT "FK_11764732d5d09ac7627cd275a94"`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" DROP CONSTRAINT "FK_9cebf86f47d68307a5e9f2c54d0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "betting_weeks" DROP CONSTRAINT "FK_cc2c51ed4da1b5899f46197f5dd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_e902b09a4e164b925d206ba3990"`,
    );

    // Drop tables
    await queryRunner.query(
      `DROP INDEX "public"."IDX_da9bddbe281bac01cd607a6114"`,
    );
    await queryRunner.query(`DROP TABLE "competitor_monthly_stats"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd368bd01aa2c044c24a299fb4"`,
    );
    await queryRunner.query(`DROP TABLE "bettor_rankings"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e3cbbd88902571073cd611b10c"`,
    );
    await queryRunner.query(`DROP TABLE "competitor_odds"`);
    await queryRunner.query(`DROP TABLE "bet_picks"`);
    await queryRunner.query(`DROP TYPE "public"."bet_picks_position_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0062d2cd91ee2eb77221ac850f"`,
    );
    await queryRunner.query(`DROP TABLE "bets"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_09d581ae84c91a4cf77bd40b7d"`,
    );
    await queryRunner.query(`DROP TABLE "betting_weeks"`);
    await queryRunner.query(`DROP TYPE "public"."betting_weeks_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b0e4d1eb939d0387788678c4f8"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);

    // Remove columns from races table
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN "bettingWeekId"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN "year"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN "month"`);

    // Remove columns from competitors table
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "isActiveThisWeek"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "currentMonthRaceCount"`,
    );
  }
}
