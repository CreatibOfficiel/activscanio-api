import { DataSource } from 'typeorm';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { Logger } from '@nestjs/common';

const logger = new Logger('CharacterSeed');

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
   * - name: Base driver name (e.g. "Yoshi", "Mario")
   * - variant: Colour / sub‑variant label, or undefined if the entry is the default look.
   */
  const charactersData = [
    // Yoshi variants (9)
    { name: 'Yoshi', variant: 'Green' },
    { name: 'Yoshi', variant: 'Red' },
    { name: 'Yoshi', variant: 'Light Blue' },
    { name: 'Yoshi', variant: 'Yellow' },
    { name: 'Yoshi', variant: 'Pink' },
    { name: 'Yoshi', variant: 'Black' },
    { name: 'Yoshi', variant: 'White' },
    { name: 'Yoshi', variant: 'Orange' },
    { name: 'Yoshi', variant: 'Dark Blue' },

    // Birdo variants (9 – Booster Course Pass Wave 4)
    { name: 'Birdo', variant: 'Pink' },
    { name: 'Birdo', variant: 'Red' },
    { name: 'Birdo', variant: 'Yellow' },
    { name: 'Birdo', variant: 'Light Blue' },
    { name: 'Birdo', variant: 'White' },
    { name: 'Birdo', variant: 'Green' },
    { name: 'Birdo', variant: 'Blue' },
    { name: 'Birdo', variant: 'Orange' },
    { name: 'Birdo', variant: 'Black' },

    // Shy Guy variants (8)
    { name: 'Shy Guy', variant: 'Red' },
    { name: 'Shy Guy', variant: 'Blue' },
    { name: 'Shy Guy', variant: 'Green' },
    { name: 'Shy Guy', variant: 'Black' },
    { name: 'Shy Guy', variant: 'Yellow' },
    { name: 'Shy Guy', variant: 'Pink' },
    { name: 'Shy Guy', variant: 'White' },
    { name: 'Shy Guy', variant: 'Cyan' },

    // Inkling variants (6)
    { name: 'Inkling (Girl)', variant: 'Orange' },
    { name: 'Inkling (Girl)', variant: 'Green' },
    { name: 'Inkling (Girl)', variant: 'Pink' },
    { name: 'Inkling (Girl)', variant: 'Purple' },
    { name: 'Inkling (Boy)', variant: 'Blue' },
    { name: 'Inkling (Boy)', variant: 'Cyan' },

    // Koopa Troopa variants (2)
    { name: 'Koopa Troopa', variant: 'Green' },
    { name: 'Koopa Troopa', variant: 'Yellow' },

    // === Standard drivers (single look) ===
    { name: 'Mario' },
    { name: 'Tanooki Mario' },
    { name: 'Metal Mario' },

    { name: 'Luigi' },

    { name: 'Peach' },
    { name: 'Cat Peach' },
    { name: 'Pink Gold Peach' },

    { name: 'Daisy' },
    { name: 'Rosalina' },
    { name: 'Peachette' },

    { name: 'Donkey Kong' },
    { name: 'Diddy Kong' },
    { name: 'Funky Kong' },

    { name: 'Wario' },
    { name: 'Waluigi' },

    { name: 'Bowser' },
    { name: 'Dry Bowser' },
    { name: 'Bowser Jr.' },

    { name: 'Dry Bones' },
    { name: 'King Boo' },
    { name: 'Petey Piranha' },
    { name: 'Wiggler' },
    { name: 'Kamek' },

    { name: 'Toad' },
    { name: 'Toadette' },

    { name: 'Lakitu' },

    { name: 'Baby Mario' },
    { name: 'Baby Luigi' },
    { name: 'Baby Peach' },
    { name: 'Baby Daisy' },
    { name: 'Baby Rosalina' },

    { name: 'Iggy' },
    { name: 'Lemmy' },
    { name: 'Larry' },
    { name: 'Ludwig' },
    { name: 'Morton' },
    { name: 'Roy' },
    { name: 'Wendy' },

    { name: 'Link' },

    { name: 'Villager (Female)' },
    { name: 'Villager (Male)' },
    { name: 'Isabelle' },
    { name: 'Pauline' },
  ];

  /**
   * 1) Build a map baseName -> { name, variants[] }.
   *    If "variant" exists, we use it as a label (e.g. "Red").
   *    If "variant" is absent, we consider it a "default" variant.
   */
  const baseMap = new Map<
    string,
    { name: string; variants: { label: string | null }[] }
  >();

  for (const c of charactersData) {
    if (!baseMap.has(c.name)) {
      baseMap.set(c.name, { name: c.name, variants: [] });
    }

    baseMap.get(c.name)!.variants.push({ label: c.variant ?? null });
  }

  /**
   * 2) For each unique baseName, create a BaseCharacter
   *    and its associated CharacterVariants.
   */
  for (const { name, variants } of baseMap.values()) {
    // Create the BaseCharacter
    const baseCharacter = new BaseCharacter();
    baseCharacter.name = name;

    // Create an array of CharacterVariant
    const variantEntities = variants.map((v) => {
      const variant = new CharacterVariant();
      // Use "Default" label when v.label is null
      variant.label = v.label ?? 'Default';
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
