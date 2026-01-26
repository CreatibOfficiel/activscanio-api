import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { CharacterVariant } from '../character-variants/character-variant.entity';

@Entity('base_characters')
export class BaseCharacter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // e.g., "Inkling", "Mario", "Luigi"

  @Column({ nullable: true })
  imageUrl: string; // Default image for the character (used when showing character selection)

  // One BaseCharacter can have many CharacterVariants
  @OneToMany(() => CharacterVariant, (variant) => variant.baseCharacter, {
    cascade: true,
  })
  variants: CharacterVariant[];
}
