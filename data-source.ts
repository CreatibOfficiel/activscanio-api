import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

// Detect if we're in production (compiled) or development
const isProd = __dirname.includes('dist');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST === 'db' ? 'localhost' : process.env.DB_HOST, // Use localhost for migration generation
  port: process.env.DB_HOST === 'db' ? 5433 : parseInt(process.env.DB_PORT || '5432'), // Use external port for localhost
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: isProd
    ? [join(__dirname, 'src', '**', '*.entity.js')]
    : [join(__dirname, 'src', '**', '*.entity.ts')],
  migrations: isProd
    ? [join(__dirname, 'src', 'migrations', '*.js')]
    : [join(__dirname, 'src', 'migrations', '*.js')],
  synchronize: false,
});
