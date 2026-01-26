import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCharacterImageUrls1764350000000 implements MigrationInterface {
  name = 'AddCharacterImageUrls1764350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add imageUrl column to base_characters table
    await queryRunner.query(`
      ALTER TABLE "base_characters"
      ADD COLUMN IF NOT EXISTS "imageUrl" character varying
    `);

    // Add imageUrl column to character_variants table
    await queryRunner.query(`
      ALTER TABLE "character_variants"
      ADD COLUMN IF NOT EXISTS "imageUrl" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove imageUrl column from character_variants table
    await queryRunner.query(`
      ALTER TABLE "character_variants"
      DROP COLUMN IF EXISTS "imageUrl"
    `);

    // Remove imageUrl column from base_characters table
    await queryRunner.query(`
      ALTER TABLE "base_characters"
      DROP COLUMN IF EXISTS "imageUrl"
    `);
  }
}
