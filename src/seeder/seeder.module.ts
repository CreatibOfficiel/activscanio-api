import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder.service';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BaseCharacter, CharacterVariant])],
  providers: [SeederService],
})
export class SeederModule {}
