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
   * - imageUrl: The path to the image of that variant
   */
  const charactersData = [
    // Yoshi variants
    { name: 'Yoshi', variant: 'Green', imageUrl: '/images/characters/yoshi-green.png' },
    { name: 'Yoshi', variant: 'Red', imageUrl: '/images/characters/yoshi-red.png' },
    { name: 'Yoshi', variant: 'Light Blue', imageUrl: '/images/characters/yoshi-lightblue.png' },
    { name: 'Yoshi', variant: 'Yellow', imageUrl: '/images/characters/yoshi-yellow.png' },
    { name: 'Yoshi', variant: 'Pink', imageUrl: '/images/characters/yoshi-pink.png' },
    { name: 'Yoshi', variant: 'Black', imageUrl: '/images/characters/yoshi-black.png' },
    { name: 'Yoshi', variant: 'White', imageUrl: '/images/characters/yoshi-white.png' },
    { name: 'Yoshi', variant: 'Orange', imageUrl: '/images/characters/yoshi-orange.png' },
    { name: 'Yoshi', variant: 'Dark Blue', imageUrl: '/images/characters/yoshi-darkblue.png' },

    // Shy Guy variants
    { name: 'Shy Guy', variant: 'Red', imageUrl: '/images/characters/shyguy-red.png' },
    { name: 'Shy Guy', variant: 'Blue', imageUrl: '/images/characters/shyguy-blue.png' },
    { name: 'Shy Guy', variant: 'Green', imageUrl: '/images/characters/shyguy-green.png' },
    { name: 'Shy Guy', variant: 'Black', imageUrl: '/images/characters/shyguy-black.png' },
    { name: 'Shy Guy', variant: 'Yellow', imageUrl: '/images/characters/shyguy-yellow.png' },
    { name: 'Shy Guy', variant: 'Pink', imageUrl: '/images/characters/shyguy-pink.png' },
    { name: 'Shy Guy', variant: 'White', imageUrl: '/images/characters/shyguy-white.png' },
    { name: 'Shy Guy', variant: 'Cyan', imageUrl: '/images/characters/shyguy-cyan.png' },

    // Inkling variants
    { name: 'Inkling (Girl)', variant: 'Orange', imageUrl: '/images/characters/inkling-f-orange.png' },
    { name: 'Inkling (Girl)', variant: 'Green', imageUrl: '/images/characters/inkling-f-green.png' },
    { name: 'Inkling (Girl)', variant: 'Pink', imageUrl: '/images/characters/inkling-f-pink.png' },
    { name: 'Inkling (Girl)', variant: 'Purple', imageUrl: '/images/characters/inkling-f-purple.png' },
    { name: 'Inkling (Boy)', variant: 'Blue', imageUrl: '/images/characters/inkling-m-blue.png' },
    { name: 'Inkling (Boy)', variant: 'Cyan', imageUrl: '/images/characters/inkling-m-cyan.png' },

    // Standard characters (no variants)
    { name: 'Mario', imageUrl: '/images/characters/mario.png' },
    { name: 'Luigi', imageUrl: '/images/characters/luigi.png' },
    { name: 'Peach', imageUrl: '/images/characters/peach.png' },
    { name: 'Daisy', imageUrl: '/images/characters/daisy.png' },
    { name: 'Rosalina', imageUrl: '/images/characters/rosalina.png' },
    { name: 'Donkey Kong', imageUrl: '/images/characters/dk.png' },
    { name: 'Wario', imageUrl: '/images/characters/wario.png' },
    { name: 'Waluigi', imageUrl: '/images/characters/waluigi.png' },
    { name: 'Toad', imageUrl: '/images/characters/toad.png' },
    { name: 'Toadette', imageUrl: '/images/characters/toadette.png' },
    { name: 'Koopa Troopa', imageUrl: '/images/characters/koopa.png' },
    { name: 'Lakitu', imageUrl: '/images/characters/lakitu.png' },
    { name: 'Baby Mario', imageUrl: '/images/characters/baby-mario.png' },
    { name: 'Baby Luigi', imageUrl: '/images/characters/baby-luigi.png' },
    { name: 'Baby Peach', imageUrl: '/images/characters/baby-peach.png' },
    { name: 'Baby Daisy', imageUrl: '/images/characters/baby-daisy.png' },
    { name: 'Baby Rosalina', imageUrl: '/images/characters/baby-rosalina.png' },
    { name: 'Iggy', imageUrl: '/images/characters/iggy.png' },
    { name: 'Lemmy', imageUrl: '/images/characters/lemmy.png' },
    { name: 'Larry', imageUrl: '/images/characters/larry.png' },
    { name: 'Ludwig', imageUrl: '/images/characters/ludwig.png' },
    { name: 'Morton', imageUrl: '/images/characters/morton.png' },
    { name: 'Roy', imageUrl: '/images/characters/roy.png' },
    { name: 'Wendy', imageUrl: '/images/characters/wendy.png' },
    { name: 'Metal Mario', imageUrl: '/images/characters/metalmario.png' },
    { name: 'Pink Gold Peach', imageUrl: '/images/characters/pinkgoldpeach.png' },
    { name: 'Link (Classic)', imageUrl: '/images/characters/link.png' },
    { name: 'Link (BOTW)', imageUrl: '/images/characters/link-botw.png' },
    { name: 'Villager (Female)', imageUrl: '/images/characters/villager-f.png' },
    { name: 'Villager (Male)', imageUrl: '/images/characters/villager-m.png' },
    { name: 'Isabelle', imageUrl: '/images/characters/isabelle.png' },
  ];

  /**
   * 1) Construire une map baseName -> { name, variants[] }.
   *    Si "variant" existe, on l'utilise comme label (ex. "Red").
   *    Si "variant" est absent, on le considère comme un variant "standard".
   */
  const baseMap = new Map<
    string,
    {
      name: string;
      variants: { label: string | null; imageUrl: string }[];
    }
  >();

  for (const c of charactersData) {
    if (!baseMap.has(c.name)) {
      baseMap.set(c.name, { name: c.name, variants: [] });
    }

    baseMap.get(c.name)!.variants.push({
      label: c.variant ?? null,   // null si pas de variant (ou "Standard" si tu préfères)
      imageUrl: c.imageUrl,
    });
  }

  /**
   * 2) Pour chaque baseName unique, on crée un BaseCharacter
   *    et ses CharacterVariants associés.
   */
  for (const { name, variants } of baseMap.values()) {
    // Créer le BaseCharacter
    const baseCharacter = new BaseCharacter();
    baseCharacter.name = name;

    // Créer un tableau de CharacterVariant
    const variantEntities = variants.map((v) => {
      const variant = new CharacterVariant();
      // On met un label "Default" quand v.label est null
      variant.label = v.label ?? "Default";
      variant.imageUrl = v.imageUrl;
      variant.baseCharacter = baseCharacter;
      return variant;
    });

    // Lier les variants au BaseCharacter
    baseCharacter.variants = variantEntities;

    // Sauvegarder (BaseCharacter + CharacterVariants)
    await baseCharacterRepo.save(baseCharacter);
  }

  console.log('✅ BaseCharacters and their variants seeded successfully!');
}
