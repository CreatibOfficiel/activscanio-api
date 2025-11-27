import { MigrationInterface, QueryRunner } from 'typeorm';

export class TemporaryRemoveCurrentTitle1764225800000 implements MigrationInterface {
  name = 'TemporaryRemoveCurrentTitle1764225800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supprimer temporairement la colonne currentTitle qui cause l'erreur
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "currentTitle"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recréer la colonne si on rollback
    await queryRunner.query(`ALTER TABLE "users" ADD "currentTitle" character varying`);
  }
}
