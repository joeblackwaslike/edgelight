import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, openDb } from '../db.js';
import type { InternalDb } from '../types.js';

const TEST_DB = './test-db-phase1';
const TEST_SCHEMA = './schema.esdl';

afterEach(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('openDb', () => {
  it('creates the data directory if it does not exist', async () => {
    const db = await openDb(TEST_DB, TEST_SCHEMA);
    expect(existsSync(TEST_DB)).toBe(true);
    await closeDb(db);
  });

  it('loads pgvector extension so vector columns can be created', async () => {
    const db = (await openDb(TEST_DB, TEST_SCHEMA)) as InternalDb;
    const result = await db.pglite.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(result.rows[0]?.extname).toBe('vector');
    await closeDb(db);
  });

  it('creates _edgelite_migrations table on first open', async () => {
    const db = (await openDb(TEST_DB, TEST_SCHEMA)) as InternalDb;
    const result = await db.pglite.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = '_edgelite_migrations'`,
    );
    expect(result.rows[0]?.tablename).toBe('_edgelite_migrations');
    await closeDb(db);
  });

  it('does not error if _edgelite_migrations already exists (idempotent open)', async () => {
    const firstDb = await openDb(TEST_DB, TEST_SCHEMA);
    await closeDb(firstDb);
    // Second open should not throw
    const secondDb = await openDb(TEST_DB, TEST_SCHEMA);
    expect(secondDb).toBeDefined();
    await closeDb(secondDb);
  });
});

describe('db.run concurrency guard', () => {
  it('throws EdgeLiteConcurrencyError when called while in flight', async () => {
    const db = (await openDb(TEST_DB, TEST_SCHEMA)) as InternalDb;
    const inFlightDb = db as unknown as Record<string, unknown>;
    inFlightDb.inFlight = true;
    await expect(db.run({})).rejects.toThrow('db.run() called while another query is in flight');
    inFlightDb.inFlight = false;
    await closeDb(db);
  });
});
