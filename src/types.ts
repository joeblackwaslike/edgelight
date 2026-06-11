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
  /**
   * Run multiple queries atomically inside a single database transaction.
   *
   * The callback receives a transaction-scoped {@link Db} handle. Every `tx.run()`
   * executes inside the transaction. If the callback resolves, the transaction
   * commits and its resolved value is returned. If the callback throws (or
   * rejects), the transaction is rolled back and the error propagates — no
   * partial writes remain.
   *
   * The outer Db's sequential lock is held for the whole transaction, so a bare
   * `db.run()` issued concurrently throws `EdgeLiteConcurrencyError`.
   *
   * Nested transactions are supported via Postgres SAVEPOINTs — a nested
   * `tx.transaction()` that throws rolls back only its own writes. Calling
   * `tx.close()` inside the callback throws `EdgeLiteRuntimeError`.
   *
   * The `tx` handle is only valid for the duration of the callback. Using a
   * retained reference after the transaction resolves throws
   * `EdgeLiteRuntimeError` rather than hitting a released PGlite transaction.
   *
   * @example
   * await db.transaction(async (tx) => {
   *   await tx.run(insertNode);
   *   await tx.run(insertEdge);
   * });
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
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
