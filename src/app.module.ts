import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { ClerkGuard } from './auth/clerk.guard';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompetitorsModule } from './competitors/competitors.module';
import { RacesModule } from './races/races.module';
import { RatingModule } from './rating/rating.module';
import { RaceAnalysisModule } from './race-analysis/race-analysis.module';
import { UploadModule } from './upload/upload.module';
import { OpenAIModule } from './openai/openai.module';
import { OpenAIService } from './openai/openai.service';
// SeederModule only loaded in dev (requires @faker-js/faker devDependency)
const SeederModule =
  process.env.NODE_ENV !== 'production'
    ? require('./seeder/seeder.module').SeederModule
    : null;
import { BaseCharactersModule } from './base-characters/base-characters.module';
import { CharacterVariantsModule } from './character-variants/character-variants.module';
import { UsersModule } from './users/users.module';
import { BettingModule } from './betting/betting.module';
import { TasksModule } from './tasks/tasks.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SeasonsModule } from './seasons/seasons.module';
import { AchievementsModule } from './achievements/achievements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ImageGenerationModule } from './image-generation/image-generation.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ExportModule } from './export/export.module';

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
    ...(SeederModule ? [SeederModule] : []),
    BaseCharactersModule,
    CharacterVariantsModule,
    UsersModule,
    BettingModule,
    TasksModule,
    OnboardingModule,
    SeasonsModule,
    AchievementsModule,
    NotificationsModule,
    ImageGenerationModule,
    WebsocketModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    OpenAIService,
    // Apply authentication globally (unless route is marked @Public())
    {
      provide: APP_GUARD,
      useClass: ClerkGuard,
    },
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
