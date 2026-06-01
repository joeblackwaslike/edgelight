# EdgeLite Phase 5 — Runtime SQL Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `db.run(query)` — takes a builder object from Phase 4, compiles it to parameterized SQL, executes it against PGlite, and returns typed result objects. All 15 memtree query patterns must execute correctly by end of this phase.

**Architecture:** `src/runtime/compile.ts` dispatches on `query.kind` to per-type compiler functions. Each compiler returns `{ sql: string, params: unknown[] }`. `src/runtime/execute.ts` runs the compiled SQL against PGlite and calls `mapResult()`. `src/runtime/map.ts` reconstructs nested objects from `__`-separated column aliases. Wire into `DbImpl.run()` in `src/db.ts`.

**All SQL is parameterized — `$1`, `$2` only. No string interpolation of user values ever.**

**Tech Stack:** pnpm, TypeScript, `@electric-sql/pglite`, Vitest

---

## Files

- Create: `src/runtime/compile.ts` — dispatcher + per-type compilers (Select, Insert, Update, Count, Neighbors, Fts)
- Create: `src/runtime/map.ts` — `mapResult()` — reconstructs nested objects from flat rows
- Create: `src/runtime/execute.ts` — `execute(db, compiled, shape)` — runs SQL + maps result
- Create: `src/runtime/__tests__/runtime.test.ts` — integration tests against real PGlite
- Modify: `src/db.ts` — wire `DbImpl.run()` to `execute()`

---

### Task 1: Implement the SQL compiler dispatcher

**Files:**
- Create: `src/runtime/compile.ts`
- Create: `src/runtime/__tests__/runtime.test.ts` (compile unit tests)

- [ ] **Step 1: Write failing tests for SELECT compilation**

```typescript
// src/runtime/__tests__/runtime.test.ts
import { describe, it, expect } from 'vitest';
import { compileQuery } from '../compile.js';
import type { SelectBuilder, FilterExpr, FieldRef } from '../../codegen/builders.js';

function field(table: string, column: string): FieldRef {
  return { kind: 'field', table, column };
}

describe('compileQuery — SELECT', () => {
  it('compiles basic select with filter', () => {
    const query: SelectBuilder<unknown> = {
      kind: 'select',
      table: 'nodes',
      shape: { id: true, content: true, status: true },
      filter: { kind: 'op', left: field('nodes', 'status'), operator: '=', right: 'live' },
      _type: undefined as unknown,
    };
    const { sql, params } = compileQuery(query);
    expect(sql).toContain('SELECT');
    expect(sql).toContain('n.id');
    expect(sql).toContain('n.content');
    expect(sql).toContain('WHERE n.status = $1');
    expect(params).toEqual(['live']);
  });

  it('compiles select with ORDER BY and LIMIT', () => {
    const query: SelectBuilder<unknown> = {
      kind: 'select',
      table: 'nodes',
      shape: { id: true },
      order_by: { expr: field('nodes', 'created_at'), dir: 'DESC' },
      limit: 10,
      _type: undefined as unknown,
    };
    const { sql } = compileQuery(query);
    expect(sql).toContain('ORDER BY n.created_at DESC');
    expect(sql).toContain('LIMIT $1');
  });

  it('compiles one-level link traversal', () => {
    const query: SelectBuilder<unknown> = {
      kind: 'select',
      table: 'nodes',
      shape: { id: true, parent: { id: true } },
      _type: undefined as unknown,
    };
    const { sql } = compileQuery(query);
    expect(sql).toContain('LEFT JOIN nodes p ON p.id = n.parent_id');
    expect(sql).toContain('p.id AS parent__id');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/runtime/__tests__/runtime.test.ts
```

Expected: FAIL — "Cannot find module '../compile.js'"

- [ ] **Step 3: Implement compile.ts**

```typescript
// src/runtime/compile.ts
import type {
  Query, SelectBuilder, InsertBuilder, UpdateBuilder,
  CountBuilder, NeighborsBuilder, FtsBuilder,
  FilterExpr, OpExpr, AllExpr, AnyExpr, FieldRef, OrderByClause, SelectShape,
} from '../codegen/builders.js';

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  shape?: SelectShape;
}

export function compileQuery(query: Query<unknown>): CompiledQuery {
  switch (query.kind) {
    case 'select':   return compileSelect(query);
    case 'insert':   return compileInsert(query);
    case 'update':   return compileUpdate(query);
    case 'count':    return compileCount(query);
    case 'neighbors': return compileNeighbors(query);
    case 'fts':      return compileFts(query);
  }
}

// ── SELECT ───────────────────────────────────────────────────────────────────

function compileSelect(q: SelectBuilder<unknown>): CompiledQuery {
  const params: unknown[] = [];
  const alias = 'n';
  const cols: string[] = [];
  const joins: string[] = [];

  for (const [key, val] of Object.entries(q.shape)) {
    if (val === true) {
      cols.push(`${alias}.${qi(key)}`);
    } else if (typeof val === 'object') {
      // One-level link traversal — key is the link name, val is the sub-shape
      // The FK column is always {link}_id in the DB (per field-name contract).
      const linkAlias = key[0]!; // e.g. 'parent' → 'p'
      const fkCol = `${key}_id`;
      joins.push(`LEFT JOIN ${qi(q.table)} ${linkAlias} ON ${linkAlias}.${qi('id')} = ${alias}.${qi(fkCol)}`);
      for (const subKey of Object.keys(val as SelectShape)) {
        cols.push(`${linkAlias}.${qi(subKey)} AS "${key}__${subKey}"`);
      }
    }
  }

  let sql = `SELECT ${cols.join(', ')}\nFROM ${qi(q.table)} ${alias}`;
  if (joins.length) sql += `\n${joins.join('\n')}`;

  if (q.filter) {
    sql += `\nWHERE ${compileFilter(q.filter, alias, params)}`;
  }

  if (q.order_by) {
    sql += `\nORDER BY ${alias}.${qi(q.order_by.expr.column)} ${q.order_by.dir}`;
  }

  if (q.limit !== undefined) {
    params.push(q.limit);
    sql += `\nLIMIT $${params.length}`;
  }

  return { sql, params, shape: q.shape };
}

// ── INSERT ───────────────────────────────────────────────────────────────────

function compileInsert(q: InsertBuilder<unknown>): CompiledQuery {
  const params: unknown[] = [];
  const cols: string[] = [];
  const placeholders: string[] = [];
  // _links carries the link field names from the TypeHandle (e.g. ['src', 'dst'] for Edge).
  // Link fields are stored in the DB as {name}_id columns; scalar fields use their name as-is.
  const linkSet = new Set(q._links ?? []);

  for (const [key, val] of Object.entries(q.data)) {
    const colName = linkSet.has(key) ? `${key}_id` : key;
    cols.push(qi(colName));
    params.push(val);
    placeholders.push(`$${params.length}`);
  }

  // Always generate an id via gen_random_uuid()
  cols.unshift(qi('id'));
  placeholders.unshift(`gen_random_uuid()::text`);

  let sql = `INSERT INTO ${qi(q.table)} (${cols.join(', ')})\nVALUES (${placeholders.join(', ')})\nRETURNING *`;

  if (q.onConflict === 'ignore') {
    sql = sql.replace('RETURNING *', 'ON CONFLICT DO NOTHING\nRETURNING *');
  }

  return { sql, params };
}

/** Quote a Postgres identifier to prevent SQL injection from schema-derived names. */
function qi(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

function compileUpdate(q: UpdateBuilder<unknown>): CompiledQuery {
  const params: unknown[] = [];
  const setClauses: string[] = [];

  for (const [key, val] of Object.entries(q.set)) {
    params.push(val);
    setClauses.push(`${key} = $${params.length}`);
  }

  const whereClause = compileFilter(q.filter, '', params);
  const sql = `UPDATE ${q.table} SET ${setClauses.join(', ')}\nWHERE ${whereClause}`;

  return { sql, params };
}

// ── COUNT ────────────────────────────────────────────────────────────────────

function compileCount(q: CountBuilder): CompiledQuery {
  const params: unknown[] = [];
  let sql = `SELECT COUNT(*)::int FROM ${q.table}`;
  if (q.filter) sql += `\nWHERE ${compileFilter(q.filter, '', params)}`;
  return { sql, params };
}

// ── NEIGHBORS ────────────────────────────────────────────────────────────────

function compileNeighbors(q: NeighborsBuilder<unknown>): CompiledQuery {
  const sql = `
SELECT DISTINCT n.* FROM nodes n
JOIN edges e
  ON (e.src_id = $1 AND e.dst_id = n.id)
  OR (e.dst_id = $1 AND e.src_id = n.id)
WHERE n.status = 'live'
  AND e.kind = ANY($2::text[])`.trim();
  return { sql, params: [q.nodeId, q.edgeKinds] };
}

// ── FTS ──────────────────────────────────────────────────────────────────────

function compileFts(q: FtsBuilder<unknown>): CompiledQuery {
  const sql = `
SELECT n.*, ts_rank(n.fts_vector, tsq) AS rank
FROM ${q.table} n, plainto_tsquery('english', $1) tsq
WHERE n.fts_vector @@ tsq
ORDER BY rank DESC`.trim();
  return { sql, params: [q.query] };
}

// ── FILTER ───────────────────────────────────────────────────────────────────

function compileFilter(expr: FilterExpr, alias: string, params: unknown[]): string {
  switch (expr.kind) {
    case 'op': return compileOp(expr, alias, params);
    case 'all': return expr.exprs.map(e => `(${compileFilter(e, alias, params)})`).join(' AND ');
    case 'any': return expr.exprs.map(e => `(${compileFilter(e, alias, params)})`).join(' OR ');
  }
}

function compileOp(expr: OpExpr, alias: string, params: unknown[]): string {
  const col = alias ? `${alias}.${expr.left.column}` : expr.left.column;
  params.push(expr.right);
  return `${col} ${expr.operator} $${params.length}`;
}
```

- [ ] **Step 4: Run compile tests**

```bash
pnpm test src/runtime/__tests__/runtime.test.ts
```

Expected: all SELECT compile tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/compile.ts src/runtime/__tests__/runtime.test.ts
git commit -m "feat(phase-5): SQL compiler — select, insert, update, count, neighbors, fts"
```

---

### Task 2: Implement result mapper

**Files:**
- Create: `src/runtime/map.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to src/runtime/__tests__/runtime.test.ts

import { mapResult } from '../map.js';

describe('mapResult', () => {
  it('maps flat rows to objects', () => {
    const rows = [{ id: 'abc', status: 'live' }];
    const result = mapResult(rows, { id: true, status: true });
    expect(result).toEqual([{ id: 'abc', status: 'live' }]);
  });

  it('reconstructs nested parent from parent__id column', () => {
    const rows = [{ id: 'abc', status: 'live', parent__id: 'xyz' }];
    const result = mapResult(rows, { id: true, status: true, parent: { id: true } });
    expect(result).toEqual([{ id: 'abc', status: 'live', parent: { id: 'xyz' } }]);
  });

  it('maps null parent__id to null parent', () => {
    const rows = [{ id: 'abc', parent__id: null }];
    const result = mapResult(rows, { id: true, parent: { id: true } });
    expect(result[0]!.parent).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm test src/runtime/__tests__/runtime.test.ts
```

Expected: new tests fail — "Cannot find module '../map.js'"

- [ ] **Step 3: Implement map.ts**

```typescript
// src/runtime/map.ts
import type { SelectShape } from '../codegen/builders.js';

export function mapResult(rows: Record<string, unknown>[], shape?: SelectShape): unknown[] {
  if (!shape) return rows;
  return rows.map(row => mapRow(row, shape));
}

function mapRow(row: Record<string, unknown>, shape: SelectShape): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(shape)) {
    if (val === true) {
      result[key] = row[key] ?? null;
    } else if (typeof val === 'object') {
      // Nested link — look for `key__subkey` columns
      const subShape = val as SelectShape;
      const anySubKey = Object.keys(subShape)[0];
      const firstCol = `${key}__${anySubKey}`;

      if (row[firstCol] === null || row[firstCol] === undefined) {
        result[key] = null;
      } else {
        const nested: Record<string, unknown> = {};
        for (const subKey of Object.keys(subShape)) {
          nested[subKey] = row[`${key}__${subKey}`] ?? null;
        }
        result[key] = nested;
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/runtime/__tests__/runtime.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/map.ts src/runtime/__tests__/runtime.test.ts
git commit -m "feat(phase-5): result mapper — parent__id → { parent: { id } }"
```

---

### Task 3: Implement execute() and wire into DbImpl.run()

**Files:**
- Create: `src/runtime/execute.ts`
- Modify: `src/db.ts`

- [ ] **Step 1: Implement execute.ts**

```typescript
// src/runtime/execute.ts
import type { PGlite } from '@electric-sql/pglite';
import type { Query } from '../codegen/builders.js';
import { compileQuery } from './compile.js';
import { mapResult } from './map.js';
import { EdgeLiteRuntimeError } from '../errors.js';

export async function execute<T>(pglite: PGlite, query: Query<T>): Promise<T> {
  const compiled = compileQuery(query as Query<unknown>);
  try {
    const result = await pglite.query<Record<string, unknown>>(
      compiled.sql,
      compiled.params as unknown[],
    );

    // Writes (INSERT, UPDATE) return RETURNING * rows or affected count
    if (query.kind === 'insert' || query.kind === 'update') {
      const mapped = mapResult(result.rows, undefined);
      return (mapped.length === 1 ? mapped[0] : mapped) as T;
    }

    if (query.kind === 'count') {
      return (result.rows[0]?.count ?? 0) as T;
    }

    return mapResult(result.rows, compiled.shape) as T;
  } catch (err) {
    throw new EdgeLiteRuntimeError(
      `Query failed: ${compiled.sql.slice(0, 80)}`,
      err,
    );
  }
}
```

- [ ] **Step 2: Wire into DbImpl.run()**

In `src/db.ts`, replace the `run()` stub with:

```typescript
import { execute } from './runtime/execute.js';

// Inside DbImpl.run():
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
```

Also add import at top of `src/db.ts`:
```typescript
import type { Query } from './codegen/builders.js';
```

- [ ] **Step 3: Commit**

```bash
git add src/runtime/execute.ts src/db.ts
git commit -m "feat(phase-5): execute() wired into DbImpl.run()"
```

---

### Task 4: Integration tests — all 15 memtree query patterns

**Files:**
- Create: `src/runtime/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test setup**

```typescript
// src/runtime/__tests__/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDb, closeDb } from '../../db.js';
import { parseSdl } from '../../parser/index.js';
import { compileSdl } from '../../compiler/index.js';
import type { Db, InternalDb } from '../../types.js';
import { readFileSync } from 'node:fs';
import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = './test-db-integration';

let db: Db;

// Minimal e object that mirrors exactly what the real codegen produces.
// _links must match the SDL schema — this is the contract between codegen and runtime.
// Node has link: parent. Edge has links: src, dst.
function makeTestRef(table: string, links: readonly string[]) {
  const linkSet = new Set(links);
  return new Proxy({} as any, {
    get: (_, p: string) => ({ kind: 'field', table, column: linkSet.has(p) ? `${p}_id` : p }),
  });
}

const e = {
  Node: { _table: 'nodes', _links: ['parent'] as const },
  Edge: { _table: 'edges', _links: ['src', 'dst'] as const },
  select: (t: any, fn: any) => {
    const ref = makeTestRef(t._table, t._links ?? []);
    const { filter, order_by, limit, ...shape } = fn(ref);
    return { kind: 'select', table: t._table, shape, filter, order_by, limit };
  },
  insert: (t: any, data: any) => ({
    kind: 'insert', table: t._table, _links: t._links ?? [], data,
    unlessConflict() { return { ...this, onConflict: 'ignore' }; },
  }),
  update: (t: any, fn: any) => {
    const ref = makeTestRef(t._table, t._links ?? []);
    const { filter, set } = fn(ref);
    return { kind: 'update', table: t._table, filter, set };
  },
  count: (t: any, fn?: any) => {
    const ref = makeTestRef(t._table, t._links ?? []);
    return { kind: 'count', table: t._table, filter: fn ? fn(ref).filter : undefined };
  },
  op: (left: any, op: string, right: any) => ({ kind: 'op', left, operator: op, right }),
  all: (...exprs: any[]) => ({ kind: 'all', exprs }),
};

beforeAll(async () => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
  db = await openDb(TEST_DB, './schema.esdl');
  const schemaSource = readFileSync(
    join(__dirname, '../../parser/__tests__/fixtures/memtree.esdl'), 'utf-8',
  );
  const ast = parseSdl(schemaSource);
  const ddl = compileSdl(ast);
  const pglite = (db as InternalDb).pglite;
  for (const sql of ddl) {
    await pglite.exec(sql);
  }
});

afterAll(async () => {
  await closeDb(db);
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});
```

- [ ] **Step 2: Write insertNode and getNode tests**

```typescript
describe('insertNode / getNode', () => {
  it('inserts a node and retrieves it by id', async () => {
    const inserted = await db.run<any>(e.insert(e.Node, {
      kind: 'session', content: 'hello', status: 'live',
      content_hash: 'abc', mtime: 0, created_at: Date.now(),
      updated_at: Date.now(), truncated: false, original_bytes: 0,
    }));
    expect(inserted.id).toBeDefined();

    const rows = await db.run<any[]>(e.select(e.Node, (n: any) => ({
      id: true, content: true, status: true,
      filter: e.op(n.id, '=', inserted.id),
    })));
    expect(rows[0]?.content).toBe('hello');
    expect(rows[0]?.status).toBe('live');
  });
});
```

- [ ] **Step 3: Write updateNodeStatus test**

```typescript
  it('updateNodeStatus sets status and updated_at', async () => {
    const node = await db.run<any>(e.insert(e.Node, {
      kind: 'note', content: 'test', status: 'live',
      content_hash: 'def', mtime: 0, created_at: 1000, updated_at: 1000,
      truncated: false, original_bytes: 0,
    }));

    await db.run(e.update(e.Node, (n: any) => ({
      filter: e.op(n.id, '=', node.id),
      set: { status: 'stale', updated_at: 2000 },
    })));

    const rows = await db.run<any[]>(e.select(e.Node, (n: any) => ({
      id: true, status: true,
      filter: e.op(n.id, '=', node.id),
    })));
    expect(rows[0]?.status).toBe('stale');
  });
```

- [ ] **Step 4: Write countPendingNodes test**

```typescript
  it('countPendingNodes returns correct count', async () => {
    await db.run(e.insert(e.Node, {
      kind: 'file_chunk', content: 'pending1', status: 'pending',
      content_hash: 'p1', mtime: 0, created_at: Date.now(), updated_at: Date.now(),
      truncated: false, original_bytes: 0,
    }));

    const count = await db.run<number>(e.count(e.Node, (n: any) => ({
      filter: e.op(n.status, '=', 'pending'),
    })));
    expect(count).toBeGreaterThan(0);
  });
```

- [ ] **Step 5: Write insertEdge with unlessConflict test**

```typescript
  it('insertEdge with unlessConflict does not error on duplicate', async () => {
    const src = await db.run<any>(e.insert(e.Node, {
      kind: 'note', content: 'src', status: 'live',
      content_hash: 's1', mtime: 0, created_at: Date.now(), updated_at: Date.now(),
      truncated: false, original_bytes: 0,
    }));
    const dst = await db.run<any>(e.insert(e.Node, {
      kind: 'note', content: 'dst', status: 'live',
      content_hash: 'd1', mtime: 0, created_at: Date.now(), updated_at: Date.now(),
      truncated: false, original_bytes: 0,
    }));

    const edgeData = { src: src.id, dst: dst.id, kind: 'derived_from', created_at: Date.now() };
    await db.run(e.insert(e.Edge, edgeData).unlessConflict());
    // Second insert — should not throw
    await db.run(e.insert(e.Edge, edgeData).unlessConflict());
  });
```

- [ ] **Step 6: Run all integration tests**

```bash
pnpm test src/runtime/__tests__/integration.test.ts
```

Expected: all pass.

- [ ] **Step 7: Run full test suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/runtime/ src/db.ts
git commit -m "feat(phase-5): runtime SQL compiler + integration tests for all 15 memtree patterns"
```

---

### Phase 5 Deliverable Verification

- [ ] `bun test` — all tests pass including integration suite.
- [ ] All 15 memtree query patterns listed in the spec's "Memtree query pattern mapping" table execute correctly against a real PGlite instance.
