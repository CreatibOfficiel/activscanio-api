import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveFormFactor1771300000000 implements MigrationInterface {
  name = 'RemoveFormFactor1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN IF EXISTS "formFactor"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "formFactor" float NOT NULL DEFAULT 1.0`,
    );
  }
}
