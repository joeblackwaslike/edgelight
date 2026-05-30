import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CountBuilder,
  FieldRef,
  FilterExpr,
  InsertBuilder,
  SelectBuilder,
  SelectShape,
  UpdateBuilder,
} from '../../codegen/builders.js';
import { compileSdl } from '../../compiler/index.js';
import { closeDb, openDb } from '../../db.js';
import { parseSdl } from '../../parser/index.js';
import type { Db, InternalDb } from '../../types.js';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = './test-db-integration';
const FIXTURE = path.join(FIXTURE_DIR, '../../parser/__tests__/fixtures/memtree.esdl');

const NODES = 'nodes';
const EDGES = 'edges';
const STATUS_LIVE = 'live';
const KIND_NOTE = 'note';

type Row = Record<string, unknown>;

function nodeField(column: string): FieldRef {
  return { kind: 'field', table: NODES, column };
}

function opEq(left: FieldRef, right: unknown): FilterExpr {
  return { kind: 'op', left, operator: '=', right };
}

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

function insertEdge(data: Row): InsertBuilder<Row> {
  const self: InsertBuilder<Row> = {
    kind: 'insert',
    table: EDGES,
    _links: ['src', 'dst'],
    data,
    _type: undefined as unknown as Row,
    unlessConflict(): InsertBuilder<Row> {
      return { ...self, onConflict: 'ignore' };
    },
  };
  return self;
}

function selectNodes(shape: SelectShape, filter?: FilterExpr): SelectBuilder<Row[]> {
  return {
    kind: 'select',
    table: NODES,
    shape,
    filter,
    _type: undefined as unknown as Row[],
  };
}

function countNodes(filter?: FilterExpr): CountBuilder {
  return { kind: 'count', table: NODES, filter };
}

function updateNodes(filter: FilterExpr, set: Row): UpdateBuilder<Row> {
  return {
    kind: 'update',
    table: NODES,
    filter,
    set,
    _type: undefined as unknown as Row,
  };
}

function makeNodeData(overrides: Row): Row {
  return {
    kind: KIND_NOTE,
    content: 'test',
    status: STATUS_LIVE,
    content_hash: 'x',
    mtime: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    truncated: false,
    original_bytes: 0,
    ...overrides,
  };
}

let db: Db;

beforeAll(async () => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
  db = await openDb(TEST_DB, './schema.esdl');
  const schemaSource = readFileSync(FIXTURE, 'utf8');
  const ast = parseSdl(schemaSource);
  const ddl = compileSdl(ast);
  const { pglite } = db as InternalDb;
  for (const sql of ddl) {
    await pglite.exec(sql);
  }
});

afterAll(async () => {
  await closeDb(db);
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('insertNode / getNode', () => {
  it('inserts a node and retrieves it by id', async () => {
    const inserted = await db.run<Row>(
      insertNode(makeNodeData({ kind: 'session', content: 'hello', content_hash: 'abc' })),
    );
    expect(inserted.id).toBeDefined();

    const rows = await db.run<Row[]>(
      selectNodes({ id: true, content: true, status: true }, opEq(nodeField('id'), inserted.id)),
    );
    expect(rows[0]?.content).toBe('hello');
    expect(rows[0]?.status).toBe(STATUS_LIVE);
  });
});

describe('updateNodeStatus', () => {
  it('sets status to stale', async () => {
    const inserted = await db.run<Row>(
      insertNode(makeNodeData({ content_hash: 'upd-1', created_at: 1000, updated_at: 1000 })),
    );

    await db.run(
      updateNodes(opEq(nodeField('id'), inserted.id), { status: 'stale', updated_at: 1000 + 1000 }),
    );

    const rows = await db.run<Row[]>(
      selectNodes({ id: true, status: true }, opEq(nodeField('id'), inserted.id)),
    );
    expect(rows[0]?.status).toBe('stale');
  });
});

describe('countPendingNodes', () => {
  it('returns a positive count after inserting pending nodes', async () => {
    await db.run(insertNode(makeNodeData({ status: 'pending', content_hash: 'p1' })));

    const count = await db.run<number>(countNodes(opEq(nodeField('status'), 'pending')));
    expect(count).toBeGreaterThan(0);
  });
});

describe('insertEdge with unlessConflict', () => {
  it('does not throw on duplicate insert', async () => {
    const srcNode = await db.run<Row>(
      insertNode(makeNodeData({ content: 'src', content_hash: 's1' })),
    );
    const destinationNode = await db.run<Row>(
      insertNode(makeNodeData({ content: 'dst', content_hash: 'd1' })),
    );

    const edgeData: Row = {
      src: String(srcNode.id),
      dst: String(destinationNode.id),
      kind: 'derived_from',
      created_at: Date.now(),
    };

    await db.run(insertEdge(edgeData).unlessConflict());
    await db.run(insertEdge(edgeData).unlessConflict());
    const edgeCount = await db.run<number>({ kind: 'count', table: EDGES });
    expect(edgeCount).toBeGreaterThan(0);
  });
});
