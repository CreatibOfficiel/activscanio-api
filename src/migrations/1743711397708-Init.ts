import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1743711397708 implements MigrationInterface {
  name = 'Init1743711397708';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "competitors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "profilePictureUrl" character varying NOT NULL, "mu" double precision NOT NULL DEFAULT '25', "sigma" double precision NOT NULL DEFAULT '8.333', "rank" integer NOT NULL DEFAULT '0', "raceCount" integer NOT NULL DEFAULT '0', "avgRank12" double precision NOT NULL, "lastRaceDate" TIMESTAMP WITH TIME ZONE, "winStreak" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_76a451dd0c8a51a0e0fb6284389" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "races" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "date" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba7d19b382156bc33244426c597" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "race_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "competitorId" character varying NOT NULL, "rank12" integer NOT NULL, "score" integer NOT NULL, "raceId" uuid, CONSTRAINT "PK_732c6bc213dcae3c8c1d5a6f038" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_results" ADD CONSTRAINT "FK_63c93d3284f00d868b1b115fc4e" FOREIGN KEY ("raceId") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "race_results" DROP CONSTRAINT "FK_63c93d3284f00d868b1b115fc4e"`,
    );
    await queryRunner.query(`DROP TABLE "race_results"`);
    await queryRunner.query(`DROP TABLE "races"`);
    await queryRunner.query(`DROP TABLE "competitors"`);
  }
}
