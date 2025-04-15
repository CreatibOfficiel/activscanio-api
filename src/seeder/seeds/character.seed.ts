import { DataSource } from 'typeorm';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';

export async function seedBaseCharacters(dataSource: DataSource) {
  const baseCharacterRepo = dataSource.getRepository(BaseCharacter);

  // Check if we already have any BaseCharacters in the database
  const existingCount = await baseCharacterRepo.count();
  if (existingCount > 0) {
    console.log('🟡 BaseCharacters already exist. Skipping...');
    return;
  }

  /**
   * Original single-table data converted to a plain array of objects.
   * Each entry used to represent one "character".
   * 
   * - name: The base character name (e.g. "Yoshi", "Mario")
   * - variant: The sub-variant label ("Red", "Green"), or undefined if it's a standard character
   */
  const charactersData = [
    // Yoshi variants
    { name: 'Yoshi', variant: 'Green' },
    { name: 'Yoshi', variant: 'Red' },
    { name: 'Yoshi', variant: 'Light Blue' },
    { name: 'Yoshi', variant: 'Yellow' },
    { name: 'Yoshi', variant: 'Pink' },
    { name: 'Yoshi', variant: 'Black' },
    { name: 'Yoshi', variant: 'White' },
    { name: 'Yoshi', variant: 'Orange' },
    { name: 'Yoshi', variant: 'Dark Blue' },

    // Shy Guy variants
    { name: 'Shy Guy', variant: 'Red' },
    { name: 'Shy Guy', variant: 'Blue' },
    { name: 'Shy Guy', variant: 'Green' },
    { name: 'Shy Guy', variant: 'Black' },
    { name: 'Shy Guy', variant: 'Yellow' },
    { name: 'Shy Guy', variant: 'Pink' },
    { name: 'Shy Guy', variant: 'White' },
    { name: 'Shy Guy', variant: 'Cyan' },

    // Inkling variants
    { name: 'Inkling (Girl)', variant: 'Orange' },
    { name: 'Inkling (Girl)', variant: 'Green' },
    { name: 'Inkling (Girl)', variant: 'Pink' },
    { name: 'Inkling (Girl)', variant: 'Purple' },
    { name: 'Inkling (Boy)', variant: 'Blue' },
    { name: 'Inkling (Boy)', variant: 'Cyan' },

    // Standard characters (no variants)
    { name: 'Mario' },
    { name: 'Luigi' },
    { name: 'Peach' },
    { name: 'Daisy' },
    { name: 'Rosalina' },
    { name: 'Donkey Kong' },
    { name: 'Wario' },
    { name: 'Waluigi' },
    { name: 'Toad' },
    { name: 'Toadette' },
    { name: 'Koopa Troopa' },
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
    { name: 'Metal Mario' },
    { name: 'Pink Gold Peach' },
    { name: 'Link' },
    { name: 'Villager (Female)' },
    { name: 'Villager (Male)' },
    { name: 'Isabelle' },
  ];

  /**
   * 1) Build a map baseName -> { name, variants[] }.
   *    If "variant" exists, we use it as a label (e.g. "Red").
   *    If "variant" is absent, we consider it a "default" variant.
   */
  const baseMap = new Map<
    string,
    {
      name: string;
      variants: { label: string | null }[];
    }
  >();

  for (const c of charactersData) {
    if (!baseMap.has(c.name)) {
      baseMap.set(c.name, { name: c.name, variants: [] });
    }

    baseMap.get(c.name)!.variants.push({
      label: c.variant ?? null,   // null if no variant
    });
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
      variant.label = v.label ?? "Default";
      variant.baseCharacter = baseCharacter;
      return variant;
    });

    // Link the variants to the BaseCharacter
    baseCharacter.variants = variantEntities;

    // Save (BaseCharacter + CharacterVariants)
    await baseCharacterRepo.save(baseCharacter);
  }

  console.log('✅ BaseCharacters and their variants seeded successfully!');
}
