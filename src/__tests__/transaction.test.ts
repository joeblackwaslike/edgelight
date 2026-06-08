import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InsertBuilder, SelectBuilder, SelectShape } from '../codegen/builders.js';
import { compileSdl } from '../compiler/index.js';
import { closeDb, openDb } from '../db.js';
import { EdgeLiteConcurrencyError, EdgeLiteRuntimeError } from '../errors.js';
import { parseSdl } from '../parser/index.js';
import type { Db, InternalDb } from '../types.js';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = './test-db-transaction';
const FIXTURE = path.join(FIXTURE_DIR, '../parser/__tests__/fixtures/memtree.esdl');

const NODES = 'nodes';

type Row = Record<string, unknown>;

function insertNode(data: Row): InsertBuilder<Row> {
  const self: InsertBuilder<Row> = {
    kind: 'insert',
    table: NODES,
    _links: ['parent'],
    data,
    _type: undefined as unknown as Row,
    unlessConflict(): InsertBuilder<Row> {
      return { ...self, onConflict: 'ignore' };
    },
  };
  return self;
}

function selectNodes(shape: SelectShape): SelectBuilder<Row[]> {
  return {
    kind: 'select',
    table: NODES,
    shape,
    _type: undefined as unknown as Row[],
  };
}

function makeNodeData(overrides: Row): Row {
  return {
    kind: 'note',
    content: 'test',
    status: 'live',
    content_hash: 'x',
    mtime: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    truncated: false,
    original_bytes: 0,
    ...overrides,
  };
}

async function countAllNodes(db: Db): Promise<number> {
  const rows = await db.run<Row[]>(selectNodes({ id: true }));
  return rows.length;
}

let db: Db;

beforeEach(async () => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
  db = await openDb(TEST_DB, './schema.esdl');
  const ast = parseSdl(readFileSync(FIXTURE, 'utf8'));
  const ddl = compileSdl(ast);
  const { pglite } = db as InternalDb;
  for (const sql of ddl) {
    await pglite.exec(sql);
  }
});

afterEach(async () => {
  await closeDb(db);
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('db.transaction', () => {
  it('commits all writes when the callback resolves', async () => {
    await db.transaction(async (tx) => {
      await tx.run(insertNode(makeNodeData({ content_hash: 'a' })));
      await tx.run(insertNode(makeNodeData({ content_hash: 'b' })));
    });

    expect(await countAllNodes(db)).toBe(2);
  });

  it('rolls back all writes when the callback throws (no partial writes)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.run(insertNode(makeNodeData({ content_hash: 'a' })));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await countAllNodes(db)).toBe(0);
  });

  it('returns the value the callback resolves to', async () => {
    const result = await db.transaction(() => Promise.resolve('done'));
    expect(result).toBe('done');
  });

  it('holds the sequential lock: a bare db.run() during a transaction throws', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const txPromise = db.transaction(async (tx) => {
      await tx.run(insertNode(makeNodeData({ content_hash: 'held' })));
      await gate;
    });

    await expect(db.run(selectNodes({ id: true }))).rejects.toThrow(EdgeLiteConcurrencyError);

    release();
    await txPromise;

    expect(await countAllNodes(db)).toBe(1);
  });

  it('commits nested transactions (savepoint released)', async () => {
    await db.transaction(async (tx) => {
      await tx.run(insertNode(makeNodeData({ content_hash: 'outer' })));
      await tx.transaction(async (inner) => {
        await inner.run(insertNode(makeNodeData({ content_hash: 'inner' })));
      });
    });

    expect(await countAllNodes(db)).toBe(2);
  });

  it('rolls back only the nested transaction on inner failure (savepoint)', async () => {
    await db.transaction(async (tx) => {
      await tx.run(insertNode(makeNodeData({ content_hash: 'outer' })));
      await expect(
        tx.transaction(async (inner) => {
          await inner.run(insertNode(makeNodeData({ content_hash: 'inner' })));
          throw new Error('inner boom');
        }),
      ).rejects.toThrow('inner boom');
    });

    // Outer write survives; the nested write was rolled back to the savepoint.
    expect(await countAllNodes(db)).toBe(1);
  });

  it('throws when close() is called inside a transaction', async () => {
    await db.transaction(async (tx) => {
      await expect(tx.close()).rejects.toThrow(EdgeLiteRuntimeError);
    });
  });
});
