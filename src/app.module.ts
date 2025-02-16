import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompetitorsModule } from './competitors/competitors.module';
import { RacesModule } from './races/races.module';

@Module({
  imports: [
    // Loads .env
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Configure TypeORM with ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),

    CompetitorsModule,
    RacesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
