import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

// Detect if we're in production (compiled) or development
const isProd = __dirname.includes('dist');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: isProd
    ? [join(__dirname, 'src', '**', '*.entity.js')]
    : [join(__dirname, 'src', '**', '*.entity.ts')],
  migrations: isProd
    ? [join(__dirname, 'src', 'migrations', '*.js')]
    : [join(__dirname, 'src', 'migrations', '*.ts')],
  synchronize: false,
});
