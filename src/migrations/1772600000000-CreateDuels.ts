import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDuels1772600000000 implements MigrationInterface {
  name = 'CreateDuels1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the duel_status_enum type
    await queryRunner.query(
      `CREATE TYPE "public"."duel_status_enum" AS ENUM('pending', 'accepted', 'resolved', 'cancelled', 'declined')`,
    );

    // Create the duels table
    await queryRunner.query(`CREATE TABLE "duels" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "challengerUserId" uuid NOT NULL,
      "challengedUserId" uuid NOT NULL,
      "challengerCompetitorId" character varying NOT NULL,
      "challengedCompetitorId" character varying NOT NULL,
      "stake" integer NOT NULL,
      "status" "public"."duel_status_enum" NOT NULL DEFAULT 'pending',
      "raceEventId" character varying,
      "winnerUserId" character varying,
      "loserUserId" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "acceptedAt" TIMESTAMP WITH TIME ZONE,
      "resolvedAt" TIMESTAMP WITH TIME ZONE,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "PK_duels_id" PRIMARY KEY ("id")
    )`);

    // Create composite index for lookups
    await queryRunner.query(
      `CREATE INDEX "IDX_duels_challenger_challenged_status" ON "duels" ("challengerUserId", "challengedUserId", "status")`,
    );

    // Add foreign keys to users table
    await queryRunner.query(
      `ALTER TABLE "duels" ADD CONSTRAINT "FK_duels_challengerUserId" FOREIGN KEY ("challengerUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ADD CONSTRAINT "FK_duels_challengedUserId" FOREIGN KEY ("challengedUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "duels" DROP CONSTRAINT "FK_duels_challengedUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" DROP CONSTRAINT "FK_duels_challengerUserId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_duels_challenger_challenged_status"`);
    await queryRunner.query(`DROP TABLE "duels"`);
    await queryRunner.query(`DROP TYPE "public"."duel_status_enum"`);
  }
}
