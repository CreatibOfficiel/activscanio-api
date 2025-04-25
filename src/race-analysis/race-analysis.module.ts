import { Module } from '@nestjs/common';
import { OpenAIModule } from '../openai/openai.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { RaceAnalysisService } from './race-analysis.service';
import { RaceAnalysisController } from './race-analysis.controller';
import { BaseCharactersModule } from 'src/base-characters/base-characters.module';
import { CharacterVariantsModule } from 'src/character-variants/character-variants.module';

@Module({
  imports: [
    OpenAIModule,
    CompetitorsModule,
    BaseCharactersModule,
    CharacterVariantsModule,
  ],
  controllers: [RaceAnalysisController],
  providers: [RaceAnalysisService],
})
export class RaceAnalysisModule {}
