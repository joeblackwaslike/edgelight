import type { PGlite } from '@electric-sql/pglite';

export interface DbOptions {
  autoMigrate?: boolean;
  /** Internal — skip the pending-migrations check (used by `migration create`). */
  skipMigrationCheck?: boolean;
}

/**
 * Public Db handle. All queries go through db.run().
 * Sequential execution is enforced — concurrent calls throw EdgeLiteConcurrencyError.
 */
export interface Db {
  /** Execute a query builder expression. Returns typed result objects. */
  /* eslint-disable @typescript-eslint/no-explicit-any -- temporary exception for untyped query builders */
  // biome-ignore lint/suspicious/noExplicitAny: temporary exception for untyped query builders
  run<T>(query: any): Promise<T>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  /** Graceful shutdown — flushes PGlite and releases the data directory lock. */
  close(): Promise<void>;
  /** Absolute path to the PGlite data directory. */
  readonly path: string;
}

/** Internal — not exported from package index. */
export interface InternalDb extends Db {
  readonly pglite: PGlite;
  readonly schemaPath: string;
  readonly options: Required<DbOptions>;
}
