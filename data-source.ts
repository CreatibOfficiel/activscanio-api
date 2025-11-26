import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST === 'db' ? 'localhost' : process.env.DB_HOST, // Use localhost for migration generation
  port: process.env.DB_HOST === 'db' ? 5433 : parseInt(process.env.DB_PORT || '5432'), // Use external port for localhost
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [join(__dirname, '**', '*.entity.{js,ts}')],
  migrations: [join(__dirname, 'src', 'migrations', '*.js')],
  synchronize: false,
});
