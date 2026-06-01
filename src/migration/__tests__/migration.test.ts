import { existsSync, rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SdlAst } from '../../parser/ast.js';
import { parseSdl } from '../../parser/index.js';
import { type DbSchema, diffSdlVsDb, introspectDb } from '../diff.js';

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

  it('excludes _edgelite_* internal tables', async () => {
    await pglite.exec(
      'CREATE TABLE IF NOT EXISTS _edgelite_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)',
    );
    const schema = await introspectDb(pglite);
    expect(schema.tables.map((t) => t.name)).not.toContain('_edgelite_migrations');
  });
});

describe('diffSdlVsDb', () => {
  it('detects new table when type exists in SDL but not in DB', () => {
    const ast = parseSdl(`
      type NewType {
        required name: str;
      }
    `);
    const dbSchema: DbSchema = { tables: [] };
    const changes = diffSdlVsDb(ast, dbSchema);
    expect(changes.some((c) => c.kind === 'add_table' && c.typeName === 'NewType')).toBe(true);
  });

  it('detects new column when property exists in SDL but not in DB', () => {
    const ast = parseSdl(`
      type Node {
        required name: str;
        new_col: str;
      }
    `);
    const dbSchema: DbSchema = {
      tables: [
        {
          name: 'nodes',
          columns: [
            { name: 'id', dataType: 'text', nullable: false },
            { name: 'name', dataType: 'text', nullable: false },
          ],
        },
      ],
    };
    const changes = diffSdlVsDb(ast, dbSchema);
    expect(changes.some((c) => c.kind === 'add_column' && c.columnName === 'new_col')).toBe(true);
  });

  it('detects removed table (destructive)', () => {
    const ast: SdlAst = { enums: [], types: [] };
    const dbSchema: DbSchema = {
      tables: [{ name: 'old_table', columns: [{ name: 'id', dataType: 'text', nullable: false }] }],
    };
    const changes = diffSdlVsDb(ast, dbSchema);
    const drop = changes.find((c) => c.kind === 'drop_table');
    expect(drop).toBeDefined();
    expect(drop?.destructive).toBe(true);
  });
});
