import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { CharacterVariant } from '../character-variants/character-variant.entity';

@Entity('base_characters')
export class BaseCharacter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // e.g., "Inkling", "Mario", "Luigi"

  // One BaseCharacter can have many CharacterVariants
  @OneToMany(() => CharacterVariant, (variant) => variant.baseCharacter, {
    cascade: true,
  })
  variants: CharacterVariant[];
}
