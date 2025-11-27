import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres' as const,
    url: config.get<string>('DATABASE_URL'),
    entities: [join(__dirname, '..', '**', '*.entity.{js,ts}')],
    migrations: [join(__dirname, '..', 'migrations', '*.js')],
    synchronize: false,
    migrationsRun: false,  // Migrations are handled by entrypoint.sh instead
  }),
};
