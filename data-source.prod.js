// data-source.prod.js - Static TypeORM config for production
const { DataSource } = require('typeorm');
const path = require('path');

require('dotenv').config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,

  // Absolute paths so TypeORM CLI resolves globs correctly
  entities: [path.join(__dirname, 'dist', 'src', '**', '*.entity.js')],
  migrations: [path.join(__dirname, 'dist', 'src', 'migrations', '*.js')],

  synchronize: false,
  logging: ['error', 'warn', 'migration'],
});

module.exports = { AppDataSource };
