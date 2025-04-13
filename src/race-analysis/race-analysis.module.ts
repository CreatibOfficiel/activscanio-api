import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { OpenAIModule } from '../openai/openai.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { RaceAnalysisService } from './race-analysis.service';
import { RaceAnalysisController } from './race-analysis.controller';
import { BaseCharactersModule } from 'src/base-characters/base-characters.module';
import { CharacterVariantsModule } from 'src/character-variants/character-variants.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseCharacter } from 'src/base-characters/base-character.entity';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';

@Module({
  imports: [
    UploadModule,
    OpenAIModule,
    CompetitorsModule,
    BaseCharactersModule,
    CharacterVariantsModule,
    TypeOrmModule.forFeature([BaseCharacter, CharacterVariant]),
  ],
  controllers: [RaceAnalysisController],
  providers: [RaceAnalysisService],
})
export class RaceAnalysisModule {}
