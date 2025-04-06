import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateDefaultValue1743928284855 implements MigrationInterface {
    name = 'UpdateDefaultValue1743928284855'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "competitors" ALTER COLUMN "avgRank12" SET DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "competitors" ALTER COLUMN "avgRank12" DROP DEFAULT`);
    }

}
