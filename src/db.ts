import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import type { Query } from './codegen/builders.js';
import { EdgeLiteConcurrencyError, EdgeLiteRuntimeError, EdgeLiteSchemaError } from './errors.js';
import { applyMigrations, getAppliedMigrations, getMigrationFiles } from './migration/apply.js';
import { execute } from './runtime/execute.js';
import type { Db, DbOptions, InternalDb } from './types.js';

export async function openDb(
  dbPath: string,
  schemaPath: string,
  options: DbOptions = {},
): Promise<Db> {
  mkdirSync(dbPath, { recursive: true });

  const pglite = await PGlite.create(dbPath, {
    extensions: { vector },
  });

  await pglite.exec('CREATE EXTENSION IF NOT EXISTS vector');
  await ensureMigrationsTable(pglite);

  const migrationsDir = path.join(path.dirname(schemaPath), 'migrations');
  if (!options.skipMigrationCheck) {
    if (options.autoMigrate) {
      await applyMigrations(pglite, migrationsDir, { allowDestructive: false });
    } else {
      const applied = await getAppliedMigrations(pglite);
      const files = getMigrationFiles(migrationsDir);
      const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/, '')));
      if (pending.length > 0) {
        throw new EdgeLiteSchemaError(
          `Unapplied migrations detected: ${pending.join(', ')}. Run \`edgelite migration apply\` or open with { autoMigrate: true }.`,
        );
      }
    }
  }

  const db: InternalDb = new DbImpl(pglite, dbPath, schemaPath, {
    autoMigrate: options.autoMigrate ?? false,
    skipMigrationCheck: options.skipMigrationCheck ?? false,
  });

  return db;
}

export async function closeDb(db: Db): Promise<void> {
  await db.close();
}

async function ensureMigrationsTable(pglite: PGlite): Promise<void> {
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS _edgelite_migrations (
      name       TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);
}

class DbImpl implements InternalDb {
  readonly pglite: PGlite;
  readonly path: string;
  readonly schemaPath: string;
  readonly options: Required<DbOptions>;
  private inFlight = false;

  constructor(pglite: PGlite, path: string, schemaPath: string, options: Required<DbOptions>) {
    this.pglite = pglite;
    this.path = path;
    this.schemaPath = schemaPath;
    this.options = options;
  }

  async run<T>(query: unknown): Promise<T> {
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError('db.run() called while another query is in flight');
    }
    this.inFlight = true;
    try {
      return await execute<T>(this.pglite, query as Query<T>);
    } finally {
      this.inFlight = false;
    }
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError(
        'db.transaction() called while another query is in flight',
      );
    }
    this.inFlight = true;
    try {
      return await this.pglite.transaction(async (tx) => {
        const txDb = new TxDb(tx, this.path, { n: 0 });
        try {
          return await fn(txDb);
        } finally {
          // Invalidate the handle so a retained reference can't be used post-commit.
          txDb.deactivate();
        }
      });
    } finally {
      this.inFlight = false;
    }
  }

  async close(): Promise<void> {
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError('db.close() called while another query is in flight');
    }
    await this.pglite.close();
  }
}

/**
 * Transaction-scoped Db handle. Routes run() through the active PGlite Transaction
 * and implements nested transactions with Postgres SAVEPOINTs. Never exported.
 */
class TxDb implements Db {
  readonly path: string;
  private readonly tx: Transaction;
  private readonly counter: { n: number };
  private inFlight = false;
  private active = true;

  constructor(tx: Transaction, path: string, counter: { n: number }) {
    this.tx = tx;
    this.path = path;
    this.counter = counter;
  }

  /** Invalidate this handle once its transaction/savepoint scope has ended. */
  deactivate(): void {
    this.active = false;
  }

  // Mirror DbImpl's sequential guard: a concurrent call on the same handle throws.
  // While a nested transaction is open, the parent handle stays locked too.
  async run<T>(query: unknown): Promise<T> {
    this.assertActive();
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError('db.run() called while another query is in flight');
    }
    this.inFlight = true;
    try {
      return await execute<T>(this.tx, query as Query<T>);
    } finally {
      this.inFlight = false;
    }
  }

  // Nested transactions via SAVEPOINT — counter-based names are unique, valid identifiers.
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    this.assertActive();
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError(
        'db.transaction() called while another query is in flight',
      );
    }
    this.inFlight = true;
    try {
      const name = `edgelite_sp_${this.counter.n++}`;
      await this.tx.query(`SAVEPOINT ${name}`);
      const child = new TxDb(this.tx, this.path, this.counter);
      try {
        const result = await fn(child);
        await this.tx.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        // Preserve the original error even if the rollback itself fails.
        try {
          await this.tx.query(`ROLLBACK TO SAVEPOINT ${name}`);
        } catch {
          // Intentionally suppressed — the original error below is the meaningful one.
        }
        throw error;
      } finally {
        child.deactivate();
      }
    } finally {
      // Reset even if SAVEPOINT acquisition itself throws, so the handle can't leak locked.
      this.inFlight = false;
    }
  }

  close(): Promise<void> {
    return Promise.reject(
      new EdgeLiteRuntimeError('Cannot close the database inside a transaction'),
    );
  }

  private assertActive(): void {
    if (!this.active) {
      throw new EdgeLiteRuntimeError('Transaction has already ended');
    }
  }
}
