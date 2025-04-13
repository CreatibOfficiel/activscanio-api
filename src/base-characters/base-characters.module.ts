import { Module } from '@nestjs/common';
import { BaseCharactersService } from './base-characters.service';
import { BaseCharactersController } from './base-characters.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseCharacter } from './base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BaseCharacter, CharacterVariant])],
  controllers: [BaseCharactersController],
  providers: [BaseCharactersService],
  exports: [BaseCharactersService, TypeOrmModule.forFeature([CharacterVariant])],
})
export class BaseCharactersModule {}
