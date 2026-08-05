import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bascule les chemins d'images de personnages de .png vers .webp.
 *
 * Les fichiers PNG ont été supprimés de public/characters : seuls les .webp
 * subsistent. Or `1764350000001-PopulateCharacterImageUrls` et
 * `1770800000000-FixCharacterImageUrls` écrivent des chemins `.png` en dur.
 *
 * Sur la base de production, la bascule a déjà été faite à la main et cette
 * migration ne trouvera aucune ligne à convertir — le `WHERE ... LIKE '%.png'`
 * la rend inoffensive. Elle existe pour une base recréée depuis zéro, où les
 * deux migrations ci-dessus s'exécuteraient d'abord et laisseraient la table
 * pointant vers des fichiers absents.
 *
 * Les anciennes migrations ne sont volontairement pas éditées : une migration
 * appliquée décrit ce qui s'est passé, et TypeORM ne la rejouera jamais sur une
 * base existante. Corriger en avant plutôt qu'en arrière.
 *
 * Le filtre `/characters/%` protège d'éventuelles URLs externes (CDN, Clerk)
 * qui n'ont rien à voir avec les assets locaux.
 */
export class SwitchCharacterImagesToWebp1774100000000
  implements MigrationInterface
{
  name = 'SwitchCharacterImagesToWebp1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "character_variants"
      SET "imageUrl" = regexp_replace("imageUrl", '\\.png$', '.webp')
      WHERE "imageUrl" LIKE '/characters/%.png'
    `);
    await queryRunner.query(`
      UPDATE "base_characters"
      SET "imageUrl" = regexp_replace("imageUrl", '\\.png$', '.webp')
      WHERE "imageUrl" LIKE '/characters/%.png'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "character_variants"
      SET "imageUrl" = regexp_replace("imageUrl", '\\.webp$', '.png')
      WHERE "imageUrl" LIKE '/characters/%.webp'
    `);
    await queryRunner.query(`
      UPDATE "base_characters"
      SET "imageUrl" = regexp_replace("imageUrl", '\\.webp$', '.png')
      WHERE "imageUrl" LIKE '/characters/%.webp'
    `);
  }
}
