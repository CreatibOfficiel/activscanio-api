import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { OpenAIModule } from '../openai/openai.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { CharactersModule } from '../characters/characters.module';
import { RaceAnalysisService } from './race-analysis.service';
import { RaceAnalysisController } from './race-analysis.controller';

@Module({
  imports: [
    UploadModule,
    OpenAIModule,
    CompetitorsModule,
    CharactersModule,
  ],
  controllers: [RaceAnalysisController],
  providers: [RaceAnalysisService],
})
export class RaceAnalysisModule {}
