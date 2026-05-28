import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { EdgeLiteConcurrencyError, EdgeLiteRuntimeError } from './errors.js';
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

  await ensureMigrationsTable(pglite);

  const db: InternalDb = new DbImpl(pglite, dbPath, schemaPath, {
    autoMigrate: options.autoMigrate ?? false,
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async run<T>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _query: unknown,
  ): Promise<T> {
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError('db.run() called while another query is in flight');
    }
    this.inFlight = true;
    try {
      // Runtime SQL compilation wired in Phase 5
      throw new Error('Not implemented — wire runtime in Phase 5');
    } catch (error) {
      if (error instanceof EdgeLiteConcurrencyError) throw error;
      throw new EdgeLiteRuntimeError(String(error), error);
    } finally {
      this.inFlight = false;
    }
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}
