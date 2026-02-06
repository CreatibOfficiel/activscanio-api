import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertRoleEnumToVarchar1770700000000
  implements MigrationInterface
{
  name = 'ConvertRoleEnumToVarchar1770700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" TYPE varchar
        USING "role"::text
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_role"
        CHECK ("role" IN ('pending', 'bettor', 'player'))
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" SET DEFAULT 'pending'
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('pending', 'bettor', 'player')
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "CHK_users_role"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" TYPE "users_role_enum"
        USING "role"::"users_role_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" SET DEFAULT 'pending'
    `);
  }
}
