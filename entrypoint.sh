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
  echo "=========================================="
  echo "🔍 DEBUG: Production Environment"
  echo "=========================================="
  echo "📁 Current directory: $(pwd)"
  echo "📂 Directory contents:"
  ls -la
  echo ""
  echo "📦 Dist directory structure:"
  ls -la dist/
  echo ""
  echo "📁 Migrations directory:"
  ls -la dist/src/migrations/ 2>/dev/null || echo "❌ dist/src/migrations/ not found!"
  echo ""
  echo "📄 data-source.prod.js content:"
  cat data-source.prod.js | grep -A 3 "migrations:"
  echo ""
  echo "🔌 Database connection:"
  echo "  DB_HOST: $DB_HOST"
  echo "  DB_PORT: $DB_PORT"
  echo "  DB_NAME: $DB_NAME"
  echo "=========================================="
  echo "🚀 Running migrations in prod mode..."
  echo "=========================================="

  # Run with verbose output
  npx typeorm migration:run -d data-source.prod.js 2>&1
  MIGRATION_EXIT_CODE=$?

  echo ""
  echo "=========================================="
  echo "📊 Migration command exit code: $MIGRATION_EXIT_CODE"
  echo "=========================================="

  if [ $MIGRATION_EXIT_CODE -ne 0 ]; then
    echo "❌ Migration failed with exit code $MIGRATION_EXIT_CODE"
    exit $MIGRATION_EXIT_CODE
  fi

  echo "✅ Migrations completed successfully"
  echo "=========================================="
  echo "Starting NestJS in prod mode..."
  exec node dist/src/main.js
fi