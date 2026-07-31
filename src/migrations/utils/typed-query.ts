import { QueryRunner } from 'typeorm';

/**
 * A typed read for migrations.
 *
 * `queryRunner.query()` is declared as returning `any`, so a call site that
 * annotates its result reads like a guarantee while checking nothing. This
 * wrapper takes the row shape as a parameter, keeping the one unavoidable
 * cast in a single audited place instead of repeating it, unremarked, at
 * every call site.
 *
 * The shape is asserted, not verified — it still has to match the SELECT.
 */
export async function typedQuery<T>(
  queryRunner: QueryRunner,
  sql: string,
  parameters?: unknown[],
): Promise<T[]> {
  const rows: unknown = await queryRunner.query(sql, parameters);
  return (rows ?? []) as T[];
}
