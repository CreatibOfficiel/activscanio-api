#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until nc -z $DB_HOST 5432; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "PostgreSQL is up - continuing"

echo "Running migrations..."
npx typeorm migration:run -d dist/data-source.js

echo "Starting NestJS..."
exec node dist/src/main.js