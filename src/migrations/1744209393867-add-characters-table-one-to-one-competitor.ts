import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCharactersTableOneToOneCompetitor1744209393867 implements MigrationInterface {
    name = 'AddCharactersTableOneToOneCompetitor1744209393867'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "characters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "imageUrl" character varying NOT NULL, "description" character varying, CONSTRAINT "PK_9d731e05758f26b9315dac5e378" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "competitors" ADD "characterId" uuid`);
        await queryRunner.query(`ALTER TABLE "competitors" ADD CONSTRAINT "FK_81553812efb8d0747a8518c06c2" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "competitors" DROP CONSTRAINT "FK_81553812efb8d0747a8518c06c2"`);
        await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "characterId"`);
        await queryRunner.query(`DROP TABLE "characters"`);
    }

}
