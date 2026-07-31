import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Entities must not map columns the migrations dropped.
 *
 * TypeORM builds its SELECT column list from entity metadata, so a property
 * whose column no longer exists makes Postgres answer `42703 column does not
 * exist` on every read of that table. For `users` that is catastrophic:
 * ClerkGuard resolves the user on every authenticated request, so a stale
 * property there takes the whole API down against a migrated database.
 *
 * Nothing catches this. `tsc` passes — the column name only exists as a
 * decorator argument and a string in a migration. The unit tests pass too,
 * because they mock the repositories. It fails on the first real query, at
 * boot, in production.
 *
 * This test reads the removal migration for the columns it drops, and
 * asserts no entity still declares them.
 */
describe('entity / schema drift', () => {
  const SRC = join(__dirname, '..');

  /** Every `.entity.ts` under src, read as source. */
  function entityFiles(dir: string): string[] {
    const found: string[] = [];
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'migrations')
          continue;
        found.push(...entityFiles(path));
      } else if (item.name.endsWith('.entity.ts')) {
        found.push(path);
      }
    }
    return found;
  }

  /** Columns dropped by a migration, as { table, column } pairs. */
  function droppedColumns(migrationSource: string) {
    const pattern = /ALTER TABLE "(\w+)" DROP COLUMN(?: IF EXISTS)? "(\w+)"/g;
    const dropped: { table: string; column: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(migrationSource)) !== null) {
      dropped.push({ table: match[1], column: match[2] });
    }
    return dropped;
  }

  /**
   * Every column dropped by any migration's `up`.
   *
   * Scanned across the whole directory rather than one named file: pinning
   * this to a single migration meant the next drop shipped unguarded, which
   * is exactly the case this test exists to catch. `down` is skipped — it
   * drops the column the `up` added, so reading it would flag every
   * additive migration as a removal.
   */
  function allDroppedColumns() {
    const dropped: { table: string; column: string }[] = [];
    const dir = join(SRC, 'migrations');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      const downAt = source.search(/public async down\s*\(/);
      const upOnly = downAt === -1 ? source : source.slice(0, downAt);
      dropped.push(...droppedColumns(upOnly));
    }
    return dropped;
  }

  const entities = entityFiles(SRC).map((path) => ({
    path,
    source: readFileSync(path, 'utf8'),
  }));

  it('finds the removal migrations and the entities', () => {
    // Guards the test itself: a rename would otherwise make it vacuous.
    expect(entities.length).toBeGreaterThan(5);
    expect(allDroppedColumns().length).toBeGreaterThan(0);
  });

  it.each(allDroppedColumns())(
    'no entity declares $table.$column, which the migration dropped',
    ({ column }) => {
      const declaring = entities.filter(({ source }) =>
        // A property declaration, not a mention in a comment or a string.
        new RegExp(`^\\s*${column}[?!]?:`, 'm').test(source),
      );

      expect(
        declaring.map((entity) => entity.path.replace(SRC, 'src')),
      ).toEqual([]);
    },
  );
});
