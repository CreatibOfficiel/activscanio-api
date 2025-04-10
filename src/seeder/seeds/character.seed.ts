import { Character } from 'src/characters/character.entity';
import { DataSource } from 'typeorm';

export async function seedCharacters(dataSource: DataSource) {
  const characterRepo = dataSource.getRepository(Character);

  const count = await characterRepo.count();
  if (count > 0) {
    console.log('🟡 Characters already exist. Skipping...');
    return;
  }

  const characters: Partial<Character>[] = [
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

    // Standard characters
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

  await characterRepo.insert(characters);

  console.log('✅ Characters seeded!');
}