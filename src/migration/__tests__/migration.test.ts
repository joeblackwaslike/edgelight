import { existsSync, rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { introspectDb } from '../diff.js';

const TEST_DB = './test-db-migration';
let pglite: PGlite;

beforeAll(async () => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
  pglite = await PGlite.create(TEST_DB, { extensions: { vector } });
  await pglite.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT NOT NULL)');
});

afterAll(async () => {
  await pglite.close();
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('introspectDb', () => {
  it('returns table names from information_schema', async () => {
    const schema = await introspectDb(pglite);
    expect(schema.tables.map((t) => t.name)).toContain('nodes');
  });

  it('returns column names for each table', async () => {
    const schema = await introspectDb(pglite);
    const nodesTable = schema.tables.find((t) => t.name === 'nodes');
    expect(nodesTable).toBeDefined();
    if (!nodesTable) return;
    expect(nodesTable.columns.map((c) => c.name)).toContain('id');
    expect(nodesTable.columns.map((c) => c.name)).toContain('content');
  });
});
