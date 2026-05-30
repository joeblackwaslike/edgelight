/* eslint-disable import-x/no-relative-parent-imports */
import type { PGlite } from '@electric-sql/pglite';
import type { Query } from '../codegen/builders.js';
import { EdgeLiteRuntimeError } from '../errors.js';
import { compileQuery } from './compile.js';
import { mapResult } from './map.js';

const ERROR_SQL_PREVIEW_LENGTH = 80;

export async function execute<T>(pglite: PGlite, query: Query<T>): Promise<T> {
  const compiled = compileQuery(query);
  try {
    const result = await pglite.query<Record<string, unknown>>(
      compiled.sql,
      compiled.params,
    );

    if (query.kind === 'count') {
      return ((result.rows[0]?.count as number | undefined) ?? 0) as T;
    }

    if (query.kind === 'insert' || query.kind === 'update') {
      const mapped = mapResult(result.rows);
      return (mapped.length === 1 ? mapped[0] : mapped) as T;
    }

    return mapResult(result.rows, compiled.shape) as T;
  } catch (error) {
    if (error instanceof EdgeLiteRuntimeError) throw error;
    throw new EdgeLiteRuntimeError(
      `Query failed: ${compiled.sql.slice(0, ERROR_SQL_PREVIEW_LENGTH)}`,
      error,
    );
  }
}
