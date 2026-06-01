import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import type { Query } from './codegen/builders.js';
import { EdgeLiteConcurrencyError, EdgeLiteSchemaError } from './errors.js';
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

  async close(): Promise<void> {
    await this.pglite.close();
  }
}
