import { Module } from '@nestjs/common';
import { BaseCharactersService } from './base-characters.service';
import { BaseCharactersController } from './base-characters.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseCharacter } from './base-character.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BaseCharacter])],
  controllers: [BaseCharactersController],
  providers: [BaseCharactersService],
  exports: [BaseCharactersService],
})
export class BaseCharactersModule {}
