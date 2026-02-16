import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAchievementDomainColumn1772100000000
  implements MigrationInterface
{
  name = 'AddAchievementDomainColumn1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "achievements" ADD "domain" varchar NOT NULL DEFAULT 'BETTING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_achievements_domain" ON "achievements" ("domain")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_achievements_domain"`);
    await queryRunner.query(
      `ALTER TABLE "achievements" DROP COLUMN "domain"`,
    );
  }
}
