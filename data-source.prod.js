// data-source.prod.js - Configuration TypeORM STATIQUE pour production
const { DataSource } = require('typeorm');

// Charger dotenv pour les variables d'environnement
require('dotenv').config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  // IMPORTANT : Chemins ABSOLUS en production
  // Dans Docker, les fichiers sont dans /app/dist/src/
  // Le pattern glob doit être une string, pas un join()
  entities: ['dist/src/**/*.entity.js'],
  migrations: ['dist/src/migrations/*.js'],

  synchronize: false,
  logging: ['error', 'warn', 'migration'],
});

module.exports = { AppDataSource };
