#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until nc -z $DB_HOST 5432; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "PostgreSQL is up - continuing"

if [ "$NODE_ENV" = "development" ]; then
  echo "Running migrations in dev mode..."
  npx typeorm-ts-node-commonjs migration:run -d data-source.ts
  echo "Starting NestJS in dev mode..."
  exec npm run start:dev
else
  echo "Starting NestJS in prod mode..."
  exec node dist/src/main.js
fi