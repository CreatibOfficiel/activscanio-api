import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { typeOrmAsyncConfig } from './config/typeorm.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompetitorsModule } from './competitors/competitors.module';
import { RacesModule } from './races/races.module';
import { RatingModule } from './rating/rating.module';
import { RaceAnalysisModule } from './race-analysis/race-analysis.module';
import { UploadModule } from './upload/upload.module';
import { OpenAIModule } from './openai/openai.module';
import { OpenAIService } from './openai/openai.service';
import { SeederModule } from './seeder/seeder.module';
import { BaseCharactersModule } from './base-characters/base-characters.module';
import { CharacterVariantsModule } from './character-variants/character-variants.module';
import { UsersModule } from './users/users.module';
import { BettingModule } from './betting/betting.module';
import { TasksModule } from './tasks/tasks.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SeasonsModule } from './seasons/seasons.module';
import { AchievementsModule } from './achievements/achievements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // Rate limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests
      },
    ]),
    CompetitorsModule,
    RacesModule,
    RatingModule,
    UploadModule,
    OpenAIModule,
    RaceAnalysisModule,
    SeederModule,
    BaseCharactersModule,
    CharacterVariantsModule,
    UsersModule,
    BettingModule,
    TasksModule,
    OnboardingModule,
    SeasonsModule,
    AchievementsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    OpenAIService,
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
