import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUnusedFields1744693518539 implements MigrationInterface {
    name = 'RemoveUnusedFields1744693518539'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "competitors" DROP CONSTRAINT "FK_81553812efb8d0747a8518c06c2"`);
        await queryRunner.query(`CREATE TABLE "base_characters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, CONSTRAINT "PK_ebfece901c16cb2c84de37a35f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "character_variants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "label" character varying NOT NULL, "baseCharacterId" uuid, "competitorId" uuid, CONSTRAINT "REL_e117eba01897ad4857ea636f6c" UNIQUE ("competitorId"), CONSTRAINT "PK_c1ae3200d8098fa3cc271ab1ba0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "competitors" DROP CONSTRAINT "UQ_81553812efb8d0747a8518c06c2"`);
        await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "characterId"`);
        await queryRunner.query(`ALTER TABLE "competitors" ADD "characterId" character varying`);
        await queryRunner.query(`ALTER TABLE "character_variants" ADD CONSTRAINT "FK_a335945bdef779d5cb26f9e4ff1" FOREIGN KEY ("baseCharacterId") REFERENCES "base_characters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "character_variants" ADD CONSTRAINT "FK_e117eba01897ad4857ea636f6cd" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character_variants" DROP CONSTRAINT "FK_e117eba01897ad4857ea636f6cd"`);
        await queryRunner.query(`ALTER TABLE "character_variants" DROP CONSTRAINT "FK_a335945bdef779d5cb26f9e4ff1"`);
        await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "characterId"`);
        await queryRunner.query(`ALTER TABLE "competitors" ADD "characterId" uuid`);
        await queryRunner.query(`ALTER TABLE "competitors" ADD CONSTRAINT "UQ_81553812efb8d0747a8518c06c2" UNIQUE ("characterId")`);
        await queryRunner.query(`DROP TABLE "character_variants"`);
        await queryRunner.query(`DROP TABLE "base_characters"`);
        await queryRunner.query(`ALTER TABLE "competitors" ADD CONSTRAINT "FK_81553812efb8d0747a8518c06c2" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
