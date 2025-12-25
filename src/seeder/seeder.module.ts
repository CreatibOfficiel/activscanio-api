import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder.service';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BaseCharacter, CharacterVariant]),
    AchievementsModule,
  ],
  providers: [SeederService],
})
export class SeederModule {}
