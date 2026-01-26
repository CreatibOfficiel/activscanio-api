import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { BaseCharacter } from '../base-characters/base-character.entity';
import { Competitor } from '../competitors/competitor.entity';

@Entity('character_variants')
export class CharacterVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  label: string; // e.g. "Red", "Blue", "Green"

  @Column({ nullable: true })
  imageUrl: string; // Image for this specific variant

  // Many CharacterVariants belong to one BaseCharacter
  @ManyToOne(() => BaseCharacter, (base) => base.variants, {
    onDelete: 'CASCADE',
  })
  baseCharacter: BaseCharacter;

  // Linked to exactly one competitor
  @OneToOne(() => Competitor, (competitor) => competitor.characterVariant, {
    nullable: true,
  })
  @JoinColumn()
  competitor: Competitor;
}
