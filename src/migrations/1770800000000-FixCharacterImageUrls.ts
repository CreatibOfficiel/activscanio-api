/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix character image URLs that point to non-existent files.
 *
 * Known issues:
 * - Characters with a single image file but multi-variant DB entries
 *   (e.g., Koopa Troopa: file is koopa-troopa.png but variant URL was koopa-troopa/green.png)
 * - Characters with variant subfolders but baseCharacter imageUrl set to a non-existent root file
 *   (e.g., Link: files are link/champions-tunic.png but baseCharacter URL was link.png)
 *
 * Strategy: For each base character, check if it has a subfolder of variants.
 * The mapping of which characters have subfolders vs single files is hardcoded
 * based on the actual public/characters/ directory structure.
 */
export class FixCharacterImageUrls1770800000000
  implements MigrationInterface
{
  name = 'FixCharacterImageUrls1770800000000';

  /**
   * Characters that have a subfolder with multiple image files.
   * All other characters have a single file at /characters/{slug}.png
   */
  private readonly CHARACTERS_WITH_SUBFOLDERS = new Set([
    'birdo',
    'inkling-boy',
    'inkling-girl',
    'link',
    'shy-guy',
    'yoshi',
  ]);

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/'/g, '')
      .replace(/\s+/g, '-')
      .replace(/[()]/g, '');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const baseCharacters = await queryRunner.query(`
      SELECT bc.id, bc.name
      FROM base_characters bc
    `);

    for (const bc of baseCharacters) {
      const characterSlug = this.toSlug(bc.name);
      const hasSubfolder = this.CHARACTERS_WITH_SUBFOLDERS.has(characterSlug);

      const variants = await queryRunner.query(
        `SELECT id, label FROM character_variants WHERE "baseCharacterId" = $1 ORDER BY label`,
        [bc.id],
      );

      if (hasSubfolder) {
        // Multi-file character: variants are in /characters/{slug}/{variant-slug}.png
        // BaseCharacter image = first variant image
        const firstVariant = variants[0];
        if (firstVariant) {
          const firstVariantSlug = this.toSlug(firstVariant.label);
          const baseImageUrl = `/characters/${characterSlug}/${firstVariantSlug}.png`;

          await queryRunner.query(
            `UPDATE base_characters SET "imageUrl" = $1 WHERE id = $2`,
            [baseImageUrl, bc.id],
          );
        }

        for (const variant of variants) {
          const variantSlug = this.toSlug(variant.label);
          const variantImageUrl = `/characters/${characterSlug}/${variantSlug}.png`;
          await queryRunner.query(
            `UPDATE character_variants SET "imageUrl" = $1 WHERE id = $2`,
            [variantImageUrl, variant.id],
          );
        }
      } else {
        // Single-file character: all variants use /characters/{slug}.png
        const imageUrl = `/characters/${characterSlug}.png`;

        await queryRunner.query(
          `UPDATE base_characters SET "imageUrl" = $1 WHERE id = $2`,
          [imageUrl, bc.id],
        );

        for (const variant of variants) {
          await queryRunner.query(
            `UPDATE character_variants SET "imageUrl" = $1 WHERE id = $2`,
            [imageUrl, variant.id],
          );
        }
      }
    }
  }

  public async down(): Promise<void> {
    // No-op: previous migration PopulateCharacterImageUrls can be re-run
  }
}
