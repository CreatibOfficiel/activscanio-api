import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres' as const,
    // Use DATABASE_URL if available (Railway), otherwise fallback to separate variables
    url: config.get<string>('DATABASE_URL') || undefined,
    host: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_HOST'),
    port: config.get<string>('DATABASE_URL') ? undefined : config.get<number>('DB_PORT'),
    username: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_USER'),
    password: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_PASS'),
    database: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_NAME'),
    entities: [join(__dirname, '..', '**', '*.entity.{js,ts}')],
    migrations: [join(__dirname, '..', 'migrations', '*.js')],
    synchronize: false,
    migrationsRun: false,  // Migrations are handled by entrypoint.sh instead
  }),
};
