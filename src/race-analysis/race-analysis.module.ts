import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { OpenAIModule } from '../openai/openai.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { RaceAnalysisService } from './race-analysis.service';
import { RaceAnalysisController } from './race-analysis.controller';
import { BaseCharactersModule } from 'src/base-characters/base-characters.module';

@Module({
  imports: [
    UploadModule,
    OpenAIModule,
    CompetitorsModule,
    BaseCharactersModule,
  ],
  controllers: [RaceAnalysisController],
  providers: [RaceAnalysisService],
})
export class RaceAnalysisModule {}
