/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix Link character variant labels and image URLs.
 *
 * The seed was originally run without named variants for Link,
 * resulting in a single variant with label "Default" and imageUrl
 * "/characters/link/default.png" (which doesn't exist).
 *
 * The actual files are:
 *   - /characters/link/classic.png
 *   - /characters/link/champions-tunic.png
 *
 * This migration:
 * 1. Ensures Link has exactly 2 variants with correct labels
 * 2. Fixes imageUrl on variants and base character
 */
export class FixLinkVariantLabelsAndUrls1770900000000
  implements MigrationInterface
{
  name = 'FixLinkVariantLabelsAndUrls1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find the Link base character
    const [link] = await queryRunner.query(
      `SELECT id FROM base_characters WHERE name = 'Link'`,
    );
    if (!link) return;

    const linkId = link.id;

    // Get current variants for Link
    const variants = await queryRunner.query(
      `SELECT id, label, "imageUrl" FROM character_variants WHERE "baseCharacterId" = $1 ORDER BY id`,
      [linkId],
    );

    if (variants.length === 1) {
      // Only one variant (likely "Default") — update it to "Classic" and create "Champion's Tunic"
      const existingVariant = variants[0];

      // Update existing variant to "Classic"
      await queryRunner.query(
        `UPDATE character_variants SET label = 'Classic', "imageUrl" = '/characters/link/classic.png' WHERE id = $1`,
        [existingVariant.id],
      );

      // Create "Champion's Tunic" variant
      await queryRunner.query(
        `INSERT INTO character_variants (label, "imageUrl", "baseCharacterId")
         VALUES ('Champion''s Tunic', '/characters/link/champions-tunic.png', $1)`,
        [linkId],
      );
    } else if (variants.length >= 2) {
      // Two or more variants — fix labels and URLs if needed
      for (const variant of variants) {
        if (
          variant.label === 'Default' ||
          variant.imageUrl === '/characters/link/default.png'
        ) {
          // This is likely the "Classic" variant
          await queryRunner.query(
            `UPDATE character_variants SET label = 'Classic', "imageUrl" = '/characters/link/classic.png' WHERE id = $1`,
            [variant.id],
          );
        } else if (
          variant.imageUrl !== '/characters/link/classic.png' &&
          variant.imageUrl !== '/characters/link/champions-tunic.png'
        ) {
          // Unknown URL, fix based on label
          const label = variant.label;
          if (label === 'Classic') {
            await queryRunner.query(
              `UPDATE character_variants SET "imageUrl" = '/characters/link/classic.png' WHERE id = $1`,
              [variant.id],
            );
          } else if (label === "Champion's Tunic") {
            await queryRunner.query(
              `UPDATE character_variants SET "imageUrl" = '/characters/link/champions-tunic.png' WHERE id = $1`,
              [variant.id],
            );
          }
        }
      }
    }

    // Fix base character imageUrl
    await queryRunner.query(
      `UPDATE base_characters SET "imageUrl" = '/characters/link/classic.png' WHERE id = $1`,
      [linkId],
    );
  }

  public async down(): Promise<void> {
    // No-op
  }
}
