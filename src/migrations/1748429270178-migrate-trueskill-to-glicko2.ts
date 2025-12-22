import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateTrueskillToGlicko21748429270178
  implements MigrationInterface
{
  name = 'MigrateTrueskillToGlicko21748429270178';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "race_results" DROP CONSTRAINT "FK_63c93d3284f00d868b1b115fc4e"`,
    );
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "mu"`);
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "sigma"`);
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "rating" double precision NOT NULL DEFAULT '1500'`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "rd" double precision NOT NULL DEFAULT '350'`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "vol" double precision NOT NULL DEFAULT '0.06'`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_results" ADD CONSTRAINT "FK_63c93d3284f00d868b1b115fc4e" FOREIGN KEY ("raceId") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "race_results" DROP CONSTRAINT "FK_63c93d3284f00d868b1b115fc4e"`,
    );
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "vol"`);
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "rd"`);
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "rating"`);
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "sigma" double precision NOT NULL DEFAULT '8.333'`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "mu" double precision NOT NULL DEFAULT '25'`,
    );
    await queryRunner.query(
      `ALTER TABLE "race_results" ADD CONSTRAINT "FK_63c93d3284f00d868b1b115fc4e" FOREIGN KEY ("raceId") REFERENCES "races"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
