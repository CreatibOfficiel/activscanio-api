import { DataSource } from 'typeorm';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { Logger } from '@nestjs/common';

const logger = new Logger('CharacterSeed');

/**
 * Helper to convert a name to a URL-friendly slug
 * e.g., "Shy Guy" -> "shy-guy", "Bowser Jr." -> "bowser-jr"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '') // Remove dots (e.g., "Bowser Jr." -> "Bowser Jr")
    .replace(/'/g, '') // Remove apostrophes (e.g., "Champion's Tunic" -> "Champions Tunic")
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[()]/g, ''); // Remove parentheses
}

/**
 * Get the image URL for a character variant.
 * Characters with variants have images in subfolders: /characters/{character}/{variant}.png
 * Characters without variants have images at root: /characters/{character}.png
 */
function getVariantImageUrl(
  characterSlug: string,
  variantSlug: string | null,
  hasMultipleVariants: boolean,
): string {
  if (hasMultipleVariants && variantSlug) {
    return `/characters/${characterSlug}/${variantSlug}.png`;
  }

  // Single variant character (label is "Default")
  return `/characters/${characterSlug}.png`;
}

/**
 * Get the default image URL for a base character.
 * For characters with variants, returns the primary/default variant image.
 */
function getDefaultImageUrl(
  characterSlug: string,
  hasMultipleVariants: boolean,
  firstVariantSlug: string | null,
): string {
  if (hasMultipleVariants && firstVariantSlug) {
    return `/characters/${characterSlug}/${firstVariantSlug}.png`;
  }

  return `/characters/${characterSlug}.png`;
}

interface CharacterEntry {
  name: string;
  slug?: string; // English slug for image URL (if different from toSlug(name))
  variant?: string;
  variantSlug?: string; // English slug for variant image URL
}

export async function seedBaseCharacters(dataSource: DataSource) {
  const baseCharacterRepo = dataSource.getRepository(BaseCharacter);

  // Check if we already have any BaseCharacters in the database
  const existingCount = await baseCharacterRepo.count();
  if (existingCount > 0) {
    logger.log('🟡 BaseCharacters already exist. Skipping...');
    return;
  }

  /**
   * Plain array listing every driver & their variant (when applicable).
   * - name: French display name
   * - slug: English slug for image URL (optional, defaults to toSlug(name))
   * - variant: French variant label
   * - variantSlug: English slug for variant image URL (optional, defaults to toSlug(variant))
   *
   * The first variant listed for each character will be used as the default image.
   */
  const charactersData: CharacterEntry[] = [
    // Yoshi variants (9) - Vert is the default/iconic color
    { name: 'Yoshi', variant: 'Vert', variantSlug: 'green' },
    { name: 'Yoshi', variant: 'Rouge', variantSlug: 'red' },
    { name: 'Yoshi', variant: 'Bleu clair', variantSlug: 'light-blue' },
    { name: 'Yoshi', variant: 'Jaune', variantSlug: 'yellow' },
    { name: 'Yoshi', variant: 'Rose', variantSlug: 'pink' },
    { name: 'Yoshi', variant: 'Noir', variantSlug: 'black' },
    { name: 'Yoshi', variant: 'Blanc', variantSlug: 'white' },
    { name: 'Yoshi', variant: 'Orange' },
    { name: 'Yoshi', variant: 'Bleu foncé', variantSlug: 'dark-blue' },

    // Birdo variants (9) - Rose is the default/iconic color
    { name: 'Birdo', variant: 'Rose', variantSlug: 'pink' },
    { name: 'Birdo', variant: 'Rouge', variantSlug: 'red' },
    { name: 'Birdo', variant: 'Jaune', variantSlug: 'yellow' },
    { name: 'Birdo', variant: 'Bleu clair', variantSlug: 'light-blue' },
    { name: 'Birdo', variant: 'Blanc', variantSlug: 'white' },
    { name: 'Birdo', variant: 'Vert', variantSlug: 'green' },
    { name: 'Birdo', variant: 'Bleu', variantSlug: 'blue' },
    { name: 'Birdo', variant: 'Orange' },
    { name: 'Birdo', variant: 'Noir', variantSlug: 'black' },

    // Maskass variants (8) - Rouge is the default/iconic color
    { name: 'Maskass', slug: 'shy-guy', variant: 'Rouge', variantSlug: 'red' },
    { name: 'Maskass', slug: 'shy-guy', variant: 'Bleu', variantSlug: 'blue' },
    {
      name: 'Maskass',
      slug: 'shy-guy',
      variant: 'Vert',
      variantSlug: 'green',
    },
    {
      name: 'Maskass',
      slug: 'shy-guy',
      variant: 'Noir',
      variantSlug: 'black',
    },
    {
      name: 'Maskass',
      slug: 'shy-guy',
      variant: 'Jaune',
      variantSlug: 'yellow',
    },
    {
      name: 'Maskass',
      slug: 'shy-guy',
      variant: 'Rose',
      variantSlug: 'pink',
    },
    {
      name: 'Maskass',
      slug: 'shy-guy',
      variant: 'Blanc',
      variantSlug: 'white',
    },
    { name: 'Maskass', slug: 'shy-guy', variant: 'Cyan' },

    // Fille Inkling variants (4) - Orange is the default
    {
      name: 'Fille Inkling',
      slug: 'inkling-girl',
      variant: 'Orange',
    },
    {
      name: 'Fille Inkling',
      slug: 'inkling-girl',
      variant: 'Vert',
      variantSlug: 'green',
    },
    {
      name: 'Fille Inkling',
      slug: 'inkling-girl',
      variant: 'Rose',
      variantSlug: 'pink',
    },
    {
      name: 'Fille Inkling',
      slug: 'inkling-girl',
      variant: 'Violet',
      variantSlug: 'purple',
    },

    // Garçon Inkling variants (2) - Bleu is the default
    {
      name: 'Garçon Inkling',
      slug: 'inkling-boy',
      variant: 'Bleu',
      variantSlug: 'blue',
    },
    { name: 'Garçon Inkling', slug: 'inkling-boy', variant: 'Cyan' },

    // Koopa (single variant only)
    { name: 'Koopa', slug: 'koopa-troopa' },

    // Link variants (2) - Classique is the more recognizable look
    { name: 'Link', variant: 'Classique', variantSlug: 'classic' },
    {
      name: 'Link',
      variant: 'Tunique du Prodige',
      variantSlug: 'champions-tunic',
    },

    // === Standard drivers (single look) ===
    { name: 'Mario' },
    { name: 'Mario Tanuki', slug: 'tanooki-mario' },
    { name: 'Mario de métal', slug: 'metal-mario' },
    { name: "Mario d'or", slug: 'gold-mario' },

    { name: 'Luigi' },

    { name: 'Peach' },
    { name: 'Peach Chat', slug: 'cat-peach' },
    { name: "Peach d'or rose", slug: 'pink-gold-peach' },

    { name: 'Daisy' },
    { name: 'Harmonie', slug: 'rosalina' },
    { name: 'Peachette' },

    { name: 'Donkey Kong' },
    { name: 'Diddy Kong' },
    { name: 'Funky Kong' },

    { name: 'Wario' },
    { name: 'Waluigi' },

    { name: 'Bowser' },
    { name: 'Bowser Skelet', slug: 'dry-bowser' },
    { name: 'Bowser Jr.' },

    { name: 'Skelerex', slug: 'dry-bones' },
    { name: 'Roi Boo', slug: 'king-boo' },
    { name: 'Flora Piranha', slug: 'petey-piranha' },
    { name: 'Wiggler' },
    { name: 'Kamek' },

    { name: 'Toad' },
    { name: 'Toadette' },

    { name: 'Lakitu' },

    { name: 'Bébé Mario', slug: 'baby-mario' },
    { name: 'Bébé Luigi', slug: 'baby-luigi' },
    { name: 'Bébé Peach', slug: 'baby-peach' },
    { name: 'Bébé Daisy', slug: 'baby-daisy' },
    { name: 'Bébé Harmonie', slug: 'baby-rosalina' },

    { name: 'Iggy' },
    { name: 'Lemmy' },
    { name: 'Larry' },
    { name: 'Ludwig' },
    { name: 'Morton' },
    { name: 'Roy' },
    { name: 'Wendy' },

    { name: 'Villageoise', slug: 'villager-female' },
    { name: 'Villageois', slug: 'villager-male' },
    { name: 'Marie', slug: 'isabelle' },
    { name: 'Pauline' },
  ];

  /**
   * 1) Build a map baseName -> { name, slug, variants[] }.
   *    If "variant" exists, we use it as a label (e.g. "Rouge").
   *    If "variant" is absent, we consider it a "default" variant.
   */
  const baseMap = new Map<
    string,
    {
      name: string;
      slug: string;
      variants: { label: string | null; variantSlug: string | null }[];
    }
  >();

  for (const c of charactersData) {
    if (!baseMap.has(c.name)) {
      baseMap.set(c.name, {
        name: c.name,
        slug: c.slug ?? toSlug(c.name),
        variants: [],
      });
    }

    baseMap.get(c.name)!.variants.push({
      label: c.variant ?? null,
      variantSlug: c.variantSlug ?? (c.variant ? toSlug(c.variant) : null),
    });
  }

  /**
   * 2) For each unique baseName, create a BaseCharacter
   *    and its associated CharacterVariants with image URLs.
   */
  for (const { name, slug, variants } of baseMap.values()) {
    const hasMultipleVariants = variants.length > 1;
    const firstVariantSlug = variants[0]?.variantSlug ?? null;

    // Create the BaseCharacter with default image
    const baseCharacter = new BaseCharacter();
    baseCharacter.name = name;
    baseCharacter.imageUrl = getDefaultImageUrl(
      slug,
      hasMultipleVariants,
      firstVariantSlug,
    );

    // Create an array of CharacterVariant with images
    const variantEntities = variants.map((v) => {
      const variant = new CharacterVariant();
      // Use "Default" label when v.label is null
      variant.label = v.label ?? 'Default';
      variant.imageUrl = getVariantImageUrl(
        slug,
        v.variantSlug,
        hasMultipleVariants,
      );
      variant.baseCharacter = baseCharacter;
      return variant;
    });

    // Link the variants to the BaseCharacter
    baseCharacter.variants = variantEntities;

    // Save (BaseCharacter + CharacterVariants)
    await baseCharacterRepo.save(baseCharacter);
  }

  logger.log('✅ BaseCharacters and their variants seeded successfully!');
}
