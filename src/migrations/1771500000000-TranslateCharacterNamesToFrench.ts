import { MigrationInterface, QueryRunner } from 'typeorm';

export class TranslateCharacterNamesToFrench1771500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Translate base_characters.name from English to French
    await queryRunner.query(`
      UPDATE base_characters SET name = 'Maskass' WHERE name = 'Shy Guy';
      UPDATE base_characters SET name = 'Fille Inkling' WHERE name = 'Inkling (Girl)';
      UPDATE base_characters SET name = 'Garçon Inkling' WHERE name = 'Inkling (Boy)';
      UPDATE base_characters SET name = 'Koopa' WHERE name = 'Koopa Troopa';
      UPDATE base_characters SET name = 'Mario Tanuki' WHERE name = 'Tanooki Mario';
      UPDATE base_characters SET name = 'Mario de métal' WHERE name = 'Metal Mario';
      UPDATE base_characters SET name = 'Mario d''or' WHERE name = 'Gold Mario';
      UPDATE base_characters SET name = 'Peach Chat' WHERE name = 'Cat Peach';
      UPDATE base_characters SET name = 'Peach d''or rose' WHERE name = 'Pink Gold Peach';
      UPDATE base_characters SET name = 'Harmonie' WHERE name = 'Rosalina';
      UPDATE base_characters SET name = 'Bowser Skelet' WHERE name = 'Dry Bowser';
      UPDATE base_characters SET name = 'Skelerex' WHERE name = 'Dry Bones';
      UPDATE base_characters SET name = 'Roi Boo' WHERE name = 'King Boo';
      UPDATE base_characters SET name = 'Flora Piranha' WHERE name = 'Petey Piranha';
      UPDATE base_characters SET name = 'Bébé Mario' WHERE name = 'Baby Mario';
      UPDATE base_characters SET name = 'Bébé Luigi' WHERE name = 'Baby Luigi';
      UPDATE base_characters SET name = 'Bébé Peach' WHERE name = 'Baby Peach';
      UPDATE base_characters SET name = 'Bébé Daisy' WHERE name = 'Baby Daisy';
      UPDATE base_characters SET name = 'Bébé Harmonie' WHERE name = 'Baby Rosalina';
      UPDATE base_characters SET name = 'Villageoise' WHERE name = 'Villager (Female)';
      UPDATE base_characters SET name = 'Villageois' WHERE name = 'Villager (Male)';
      UPDATE base_characters SET name = 'Marie' WHERE name = 'Isabelle';
    `);

    // Translate character_variants.label from English to French
    await queryRunner.query(`
      UPDATE character_variants SET label = 'Rouge' WHERE label = 'Red';
      UPDATE character_variants SET label = 'Vert' WHERE label = 'Green';
      UPDATE character_variants SET label = 'Bleu clair' WHERE label = 'Light Blue';
      UPDATE character_variants SET label = 'Jaune' WHERE label = 'Yellow';
      UPDATE character_variants SET label = 'Rose' WHERE label = 'Pink';
      UPDATE character_variants SET label = 'Noir' WHERE label = 'Black';
      UPDATE character_variants SET label = 'Blanc' WHERE label = 'White';
      UPDATE character_variants SET label = 'Orange' WHERE label = 'Orange';
      UPDATE character_variants SET label = 'Bleu foncé' WHERE label = 'Dark Blue';
      UPDATE character_variants SET label = 'Bleu' WHERE label = 'Blue';
      UPDATE character_variants SET label = 'Violet' WHERE label = 'Purple';
      UPDATE character_variants SET label = 'Classique' WHERE label = 'Classic';
      UPDATE character_variants SET label = 'Tunique du Prodige' WHERE label = 'Champion''s Tunic';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert base_characters.name from French to English
    await queryRunner.query(`
      UPDATE base_characters SET name = 'Shy Guy' WHERE name = 'Maskass';
      UPDATE base_characters SET name = 'Inkling (Girl)' WHERE name = 'Fille Inkling';
      UPDATE base_characters SET name = 'Inkling (Boy)' WHERE name = 'Garçon Inkling';
      UPDATE base_characters SET name = 'Koopa Troopa' WHERE name = 'Koopa';
      UPDATE base_characters SET name = 'Tanooki Mario' WHERE name = 'Mario Tanuki';
      UPDATE base_characters SET name = 'Metal Mario' WHERE name = 'Mario de métal';
      UPDATE base_characters SET name = 'Gold Mario' WHERE name = 'Mario d''or';
      UPDATE base_characters SET name = 'Cat Peach' WHERE name = 'Peach Chat';
      UPDATE base_characters SET name = 'Pink Gold Peach' WHERE name = 'Peach d''or rose';
      UPDATE base_characters SET name = 'Rosalina' WHERE name = 'Harmonie';
      UPDATE base_characters SET name = 'Dry Bowser' WHERE name = 'Bowser Skelet';
      UPDATE base_characters SET name = 'Dry Bones' WHERE name = 'Skelerex';
      UPDATE base_characters SET name = 'King Boo' WHERE name = 'Roi Boo';
      UPDATE base_characters SET name = 'Petey Piranha' WHERE name = 'Flora Piranha';
      UPDATE base_characters SET name = 'Baby Mario' WHERE name = 'Bébé Mario';
      UPDATE base_characters SET name = 'Baby Luigi' WHERE name = 'Bébé Luigi';
      UPDATE base_characters SET name = 'Baby Peach' WHERE name = 'Bébé Peach';
      UPDATE base_characters SET name = 'Baby Daisy' WHERE name = 'Bébé Daisy';
      UPDATE base_characters SET name = 'Baby Rosalina' WHERE name = 'Bébé Harmonie';
      UPDATE base_characters SET name = 'Villager (Female)' WHERE name = 'Villageoise';
      UPDATE base_characters SET name = 'Villager (Male)' WHERE name = 'Villageois';
      UPDATE base_characters SET name = 'Isabelle' WHERE name = 'Marie';
    `);

    // Revert character_variants.label from French to English
    await queryRunner.query(`
      UPDATE character_variants SET label = 'Red' WHERE label = 'Rouge';
      UPDATE character_variants SET label = 'Green' WHERE label = 'Vert';
      UPDATE character_variants SET label = 'Light Blue' WHERE label = 'Bleu clair';
      UPDATE character_variants SET label = 'Yellow' WHERE label = 'Jaune';
      UPDATE character_variants SET label = 'Pink' WHERE label = 'Rose';
      UPDATE character_variants SET label = 'Black' WHERE label = 'Noir';
      UPDATE character_variants SET label = 'White' WHERE label = 'Blanc';
      UPDATE character_variants SET label = 'Orange' WHERE label = 'Orange';
      UPDATE character_variants SET label = 'Dark Blue' WHERE label = 'Bleu foncé';
      UPDATE character_variants SET label = 'Blue' WHERE label = 'Bleu';
      UPDATE character_variants SET label = 'Purple' WHERE label = 'Violet';
      UPDATE character_variants SET label = 'Classic' WHERE label = 'Classique';
      UPDATE character_variants SET label = 'Champion''s Tunic' WHERE label = 'Tunique du Prodige';
    `);
  }
}
