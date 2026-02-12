#!/bin/sh
set -e

# Extract DB host and port from DATABASE_URL
# Format: postgresql://user:pass@host:port/db
DB_HOST_EXTRACTED=$(echo $DATABASE_URL | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT_EXTRACTED=$(echo $DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|')

echo "Waiting for PostgreSQL to be ready..."
until nc -z $DB_HOST_EXTRACTED $DB_PORT_EXTRACTED; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "PostgreSQL is up - continuing"

if [ "$NODE_ENV" = "development" ]; then
  npm install
  echo "Running migrations in dev mode..."
  npx typeorm-ts-node-commonjs migration:run -d data-source.ts
  echo "Starting NestJS in dev mode..."
  exec npm run start:dev
else
  echo "Running migrations in prod mode..."
  npx typeorm migration:run -d data-source.prod.js 2>&1
  MIGRATION_EXIT_CODE=$?

  if [ $MIGRATION_EXIT_CODE -ne 0 ]; then
    echo "Migration failed with exit code $MIGRATION_EXIT_CODE"
    exit $MIGRATION_EXIT_CODE
  fi

  echo "Migrations completed successfully"
  echo "Starting NestJS in prod mode..."
  exec node dist/src/main.js
fi
