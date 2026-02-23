import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLiveBetting1772700000000 implements MigrationInterface {
  name = 'CreateLiveBetting1772700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."live_bet_status_enum" AS ENUM('detecting', 'active', 'won', 'lost', 'cancelled')`,
    );

    await queryRunner.query(`CREATE TABLE "live_bets" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "competitorId" character varying NOT NULL,
      "oddAtBet" double precision NOT NULL,
      "photoUrl" character varying NOT NULL,
      "detectedCharacters" jsonb,
      "confirmedCompetitorIds" jsonb,
      "detectionExpiresAt" TIMESTAMP WITH TIME ZONE,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "raceEventId" uuid,
      "status" "public"."live_bet_status_enum" NOT NULL DEFAULT 'detecting',
      "pointsEarned" double precision,
      "cancellationReason" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "resolvedAt" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "PK_live_bets_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(
      `CREATE INDEX "IDX_live_bets_userId_status" ON "live_bets" ("userId", "status")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_live_bets_status_expiresAt" ON "live_bets" ("status", "expiresAt")`,
    );

    await queryRunner.query(
      `ALTER TABLE "live_bets" ADD CONSTRAINT "FK_live_bets_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "live_bets" ADD CONSTRAINT "FK_live_bets_raceEventId" FOREIGN KEY ("raceEventId") REFERENCES "races"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "live_bets" DROP CONSTRAINT "FK_live_bets_raceEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "live_bets" DROP CONSTRAINT "FK_live_bets_userId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_live_bets_status_expiresAt"`);
    await queryRunner.query(`DROP INDEX "IDX_live_bets_userId_status"`);
    await queryRunner.query(`DROP TABLE "live_bets"`);
    await queryRunner.query(`DROP TYPE "public"."live_bet_status_enum"`);
  }
}
