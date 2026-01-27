/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class PopulateCharacterImageUrls1764350000001
  implements MigrationInterface
{
  name = 'PopulateCharacterImageUrls1764350000001';

  /**
   * Helper to convert a name to a URL-friendly slug
   */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\./g, '') // Remove dots
      .replace(/'/g, '') // Remove apostrophes (e.g., "Champion's Tunic" -> "Champions Tunic")
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[()]/g, ''); // Remove parentheses
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all base characters with their variants
    const baseCharacters = await queryRunner.query(`
      SELECT bc.id, bc.name,
             (SELECT COUNT(*) FROM character_variants cv WHERE cv."baseCharacterId" = bc.id) as variant_count
      FROM base_characters bc
    `);

    for (const bc of baseCharacters) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const characterSlug = this.toSlug(bc.name);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const hasMultipleVariants = parseInt(bc.variant_count) > 1;

      // Get all variants for this character
      const variants = await queryRunner.query(
        `SELECT id, label FROM character_variants WHERE "baseCharacterId" = $1`,
        [bc.id],
      );

      if (hasMultipleVariants) {
        // Character with multiple variants - use first variant as default image
        const firstVariant = variants[0];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const firstVariantSlug = this.toSlug(firstVariant.label);
        const defaultImageUrl = `/characters/${characterSlug}/${firstVariantSlug}.png`;

        // Update base character image
        await queryRunner.query(
          `UPDATE base_characters SET "imageUrl" = $1 WHERE id = $2`,
          [defaultImageUrl, bc.id],
        );

        // Update each variant image
        for (const variant of variants) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const variantSlug = this.toSlug(variant.label);
          const variantImageUrl = `/characters/${characterSlug}/${variantSlug}.png`;
          await queryRunner.query(
            `UPDATE character_variants SET "imageUrl" = $1 WHERE id = $2`,

            [variantImageUrl, variant.id],
          );
        }
      } else {
        // Single variant character
        const imageUrl = `/characters/${characterSlug}.png`;

        // Update base character image
        await queryRunner.query(
          `UPDATE base_characters SET "imageUrl" = $1 WHERE id = $2`,
          [imageUrl, bc.id],
        );

        // Update the single variant image
        if (variants.length > 0) {
          await queryRunner.query(
            `UPDATE character_variants SET "imageUrl" = $1 WHERE id = $2`,
            [imageUrl, variants[0].id],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Clear all imageUrl values
    await queryRunner.query(`UPDATE base_characters SET "imageUrl" = NULL`);
    await queryRunner.query(`UPDATE character_variants SET "imageUrl" = NULL`);
  }
}
