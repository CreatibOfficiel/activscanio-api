import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveCharacterIdColumn1744779208049 implements MigrationInterface {
    name = 'RemoveCharacterIdColumn1744779208049'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "characterId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "competitors" ADD "characterId" character varying`);
    }

}
