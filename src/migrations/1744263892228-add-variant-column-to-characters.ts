import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantColumnToCharacters1744263892228
  implements MigrationInterface
{
  name = 'AddVariantColumnToCharacters1744263892228';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "characters" RENAME COLUMN "description" TO "variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP CONSTRAINT "FK_81553812efb8d0747a8518c06c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD CONSTRAINT "UQ_81553812efb8d0747a8518c06c2" UNIQUE ("characterId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD CONSTRAINT "FK_81553812efb8d0747a8518c06c2" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP CONSTRAINT "FK_81553812efb8d0747a8518c06c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP CONSTRAINT "UQ_81553812efb8d0747a8518c06c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD CONSTRAINT "FK_81553812efb8d0747a8518c06c2" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "characters" RENAME COLUMN "variant" TO "description"`,
    );
  }
}
