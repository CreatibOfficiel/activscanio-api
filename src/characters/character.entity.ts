import { Competitor } from 'src/competitors/competitor.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';

@Entity('characters')
export class Character {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  imageUrl: string;

  @Column({ nullable: true })
  description: string;

  @OneToOne(() => Competitor, (competitor) => competitor.character)
  competitor: Competitor;
}