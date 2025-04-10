import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmAsyncConfig } from './config/typeorm.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompetitorsModule } from './competitors/competitors.module';
import { RacesModule } from './races/races.module';
import { RatingModule } from './rating/rating.module';
import { CharactersModule } from './characters/characters.module';
import { RaceAnalysisModule } from './race-analysis/race-analysis.module';
import { UploadModule } from './upload/upload.module';
import { OpenAIModule } from './openai/openai.module';
import { OpenAIService } from './openai/openai.service';
import { SeederModule } from './seeder/seeder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    CompetitorsModule,
    RacesModule,
    RatingModule,
    CharactersModule,
    UploadModule,
    OpenAIModule,
    RaceAnalysisModule,
    SeederModule,
  ],
  controllers: [AppController],
  providers: [AppService, OpenAIService],
})
export class AppModule {}
