# EdgeLite Phase 7 — memtree Integration Implementation Plan

> **⚠️ SUPERSEDED** — Replaced by `docs/superpowers/plans/2026-06-01-edgelite-phase-7-pluggable-backend.md`.
> The revised plan introduces a pluggable `StoreBackend` interface (SQLite + EdgeLite backends, both tested) and updates all callers. Do not implement this file.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace memtree's raw SQL store layer (`store/db.ts`, `store/nodes.ts`, `store/edges.ts`) with EdgeLite calls. All 15 query patterns must pass memtree's existing test suite with zero raw SQL remaining in the store layer.

**Architecture:** This phase works inside the **memtree** repo (not the edgelite repo). Install `edgelite` as a dependency, run `edgelite codegen` to generate `dbschema/edgelite.ts`, then replace each store file function-by-function. The memtree spec's "Memtree query pattern mapping" table is the authoritative guide — every row maps one memtree function to one EdgeLite call.

**Tech Stack:** Bun, TypeScript, `edgelite` (local path or npm), memtree's existing test framework

---

## Files (all inside the memtree repo)

- Modify: `package.json` — add `edgelite` dependency
- Create: `dbschema/schema.esdl` — memtree's canonical schema (copy from edgelite fixture)
- Create: `dbschema/migrations/00001-init.sql` — initial migration (generated via `edgelite migration create`)
- Create: `dbschema/edgelite.ts` — generated query builder (run `edgelite codegen`)
- Modify: `store/db.ts` — replace raw PGlite setup with `openDb()`
- Modify: `store/nodes.ts` — replace all node query functions with `e.*` calls
- Modify: `store/edges.ts` — replace all edge query functions with `e.*` calls

---

### Task 1: Install edgelite and generate the schema

**Files:**
- Modify: `package.json` (in memtree repo)
- Create: `dbschema/schema.esdl`

- [ ] **Step 1: Add edgelite dependency**

If working from the local edgelite repo:
```bash
pnpm add ../path/to/edgelite
```

If published to npm:
```bash
pnpm add edgelite
```

- [ ] **Step 2: Copy memtree's SDL schema**

Create `dbschema/schema.esdl` with the following content (this is the authoritative v1 contract from the EdgeLite spec):

```sdl
scalar type NodeKind extending enum<
  session, file_chunk, tool_output, summary, note, observation, web_chunk
>;
scalar type NodeStatus extending enum<pending, live, stale, superseded, pruned>;
scalar type EdgeKind extending enum<derived_from, references, summarizes, supersedes>;

type Node {
  required kind:           NodeKind;
  required status:         NodeStatus  { default := 'pending' };
  required content:        str         { default := '' };
  required content_hash:   str         { default := '' };
  required mtime:          int64       { default := 0 };
  required created_at:     int64;
  required updated_at:     int64;
  required truncated:      bool        { default := false };
  required original_bytes: int64       { default := 0 };
  source_uri:              str;
  metadata:                json        { default := '{}' };
  session_id:              str;
  file_path:               str;
  embedding:               vector(1536);
  parent:                  Node;

  index fts on (.content);
  index vec on (.embedding) using ivfflat;
}

type Edge {
  required src:        Node;
  required dst:        Node;
  required kind:       EdgeKind;
  required created_at: int64;

  constraint exclusive on ((.src, .dst, .kind));
}
```

- [ ] **Step 3: Run codegen**

```bash
pnpm exec edgelite codegen dbschema/schema.esdl
```

Expected:
```
✓ Generated dbschema/edgelite.ts from dbschema/schema.esdl
```

- [ ] **Step 4: Create and apply initial migration**

```bash
pnpm exec edgelite migration create
pnpm exec edgelite migration apply
```

Expected: `00001-*.sql` created in `dbschema/migrations/`, applied successfully.

- [ ] **Step 5: Commit**

```bash
git add dbschema/ package.json
git commit -m "feat(phase-7): add edgelite, generate schema + initial migration"
```

---

### Task 2: Replace store/db.ts

**Files:**
- Modify: `store/db.ts`

- [ ] **Step 1: Read the current store/db.ts**

Note the current `openDb`-equivalent call — typically something like:
```typescript
const db = await PGlite.create('./memtree-db', { extensions: { vector } });
// ... raw table creation SQL ...
```

- [ ] **Step 2: Replace with openDb()**

```typescript
// store/db.ts
import { openDb, closeDb, type Db } from 'edgelite';
export type { Db };

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!_db) {
    _db = await openDb('./memtree-db', './dbschema/schema.esdl', { autoMigrate: true });
  }
  return _db;
}

export async function closeAll(): Promise<void> {
  if (_db) {
    await closeDb(_db);
    _db = null;
  }
}
```

- [ ] **Step 3: Run existing memtree tests**

```bash
pnpm test
```

Expected: tests that only use `getDb()` pass. Tests that call `store/nodes.ts` or `store/edges.ts` will still fail until those are replaced.

- [ ] **Step 4: Commit**

```bash
git add store/db.ts
git commit -m "feat(phase-7): replace store/db.ts with openDb()"
```

---

### Task 3: Replace store/nodes.ts — all 12 node patterns

**Files:**
- Modify: `store/nodes.ts`

Replace each function using the spec's "Memtree query pattern mapping" table. The complete replacement:

- [ ] **Step 1: Replace insertNode**

```typescript
import e from '../dbschema/edgelite.js';
import { getDb } from './db.js';

export async function insertNode(data: {
  kind: string; content: string; status: string;
  content_hash: string; mtime: number; created_at: number; updated_at: number;
  truncated: boolean; original_bytes: number;
  source_uri?: string; metadata?: object; session_id?: string; file_path?: string;
}) {
  const db = await getDb();
  return db.run(e.insert(e.Node, data));
}
```

- [ ] **Step 2: Replace getNode**

```typescript
export async function getNode(id: string) {
  const db = await getDb();
  const rows = await db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, status: true, content: true, content_hash: true,
    mtime: true, created_at: true, updated_at: true, truncated: true,
    original_bytes: true, source_uri: true, metadata: true,
    session_id: true, file_path: true,
    filter: e.op(n.id, '=', id),
  })));
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Replace updateNodeStatus**

```typescript
export async function updateNodeStatus(id: string, status: string) {
  const db = await getDb();
  return db.run(e.update(e.Node, n => ({
    filter: e.op(n.id, '=', id),
    set: { status, updated_at: Date.now() },
  })));
}
```

- [ ] **Step 4: Replace getNodeBySourceUri**

```typescript
export async function getNodeBySourceUri(source_uri: string) {
  const db = await getDb();
  const rows = await db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, status: true, content: true,
    filter: e.all(
      e.op(n.source_uri, '=', source_uri),
      e.op(n.status, '=', 'live'),
    ),
    limit: 1,
  })));
  return rows[0] ?? null;
}
```

- [ ] **Step 5: Replace getNodeByContentHash**

```typescript
export async function getNodeByContentHash(content_hash: string) {
  const db = await getDb();
  const rows = await db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, status: true, content: true,
    filter: e.all(
      e.op(n.content_hash, '=', content_hash),
      e.op(n.status, '=', 'live'),
    ),
    limit: 1,
  })));
  return rows[0] ?? null;
}
```

- [ ] **Step 6: Replace listChildren**

```typescript
export async function listChildren(parentId: string, status: string) {
  const db = await getDb();
  return db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, status: true, content: true, created_at: true,
    filter: e.all(
      e.op(n.parent, '=', parentId),   // n.parent resolves to FieldRef{column:'parent_id'} via link-aware ref proxy
      e.op(n.status, '=', status),
    ),
    order_by: { expr: n.created_at, dir: 'ASC' as const },
  })));
}
```

- [ ] **Step 7: Replace getOrCreateSessionNode**

```typescript
export async function getOrCreateSessionNode(session_id: string) {
  const db = await getDb();
  const existing = await db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, session_id: true, status: true,
    filter: e.all(
      e.op(n.session_id, '=', session_id),
      e.op(n.kind, '=', 'session'),
    ),
    limit: 1,
  })));
  if (existing[0]) return existing[0];

  return db.run(e.insert(e.Node, {
    kind: 'session', content: '', status: 'live',
    content_hash: '', mtime: 0,
    created_at: Date.now(), updated_at: Date.now(),
    truncated: false, original_bytes: 0,
    session_id,
  }));
}
```

- [ ] **Step 8: Replace markStaleByFilePath, pruneNode, countPendingNodes, getPendingNodes, getLiveFileChunks, getStaleNodes, getSupersededNodes**

```typescript
export async function markStaleByFilePath(file_path: string, mtime: number) {
  const db = await getDb();
  return db.run(e.update(e.Node, n => ({
    filter: e.all(
      e.op(n.file_path, '=', file_path),
      e.op(n.mtime, '!=', mtime),
      e.op(n.status, '=', 'live'),
    ),
    set: { status: 'stale', updated_at: Date.now() },
  })));
}

export async function pruneNode(id: string) {
  const db = await getDb();
  return db.run(e.update(e.Node, n => ({
    filter: e.op(n.id, '=', id),
    set: { status: 'pruned', content: '', updated_at: Date.now() },
  })));
}

export async function countPendingNodes() {
  const db = await getDb();
  return db.run<number>(e.count(e.Node, n => ({
    filter: e.op(n.status, '=', 'pending'),
  })));
}

export async function getPendingNodes(limit = 50) {
  const db = await getDb();
  return db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, content: true, status: true, created_at: true,
    filter: e.op(n.status, '=', 'pending'),
    order_by: { expr: n.created_at, dir: 'ASC' as const },
    limit,
  })));
}

export async function getLiveFileChunks(file_path: string) {
  const db = await getDb();
  return db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, content: true, file_path: true,
    filter: e.all(
      e.op(n.file_path, '=', file_path),
      e.op(n.status, '=', 'live'),
      e.op(n.kind, '=', 'file_chunk'),
    ),
  })));
}

export async function getStaleNodes() {
  const db = await getDb();
  return db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, status: true,
    filter: e.op(n.status, '=', 'stale'),
  })));
}

export async function getSupersededNodes() {
  const db = await getDb();
  return db.run<any[]>(e.select(e.Node, n => ({
    id: true, kind: true, status: true,
    filter: e.op(n.status, '=', 'superseded'),
  })));
}
```

- [ ] **Step 9: Run tests**

```bash
pnpm test
```

Expected: all node store tests pass.

- [ ] **Step 10: Commit**

```bash
git add store/nodes.ts
git commit -m "feat(phase-7): replace store/nodes.ts with EdgeLite calls"
```

---

### Task 4: Replace store/edges.ts — 3 edge patterns

> **FK column mapping is automatic.** `e.Edge._links = ['src', 'dst']`. When you call `e.insert(e.Edge, { src: id1, dst: id2, kind: '...' })`, the runtime's `compileInsert` uses `_links` to remap `src` → `src_id` and `dst` → `dst_id` before building the SQL. No manual `_id` suffix is needed in the call site.
>
> Similarly, `e.op(edge.src, '=', id)` in a select filter compiles to `WHERE n.src_id = $1` because the ref proxy is link-aware (it returns `{column: 'src_id'}` for any link field name).

**Files:**
- Modify: `store/edges.ts`

- [ ] **Step 1: Replace insertEdge, getNeighbors, getEdgesFrom**

```typescript
// store/edges.ts
import e from '../dbschema/edgelite.js';
import { getDb } from './db.js';

export async function insertEdge(data: {
  src: string; dst: string; kind: string; created_at: number;
}) {
  const db = await getDb();
  return db.run(e.insert(e.Edge, data).unlessConflict());
}

export async function getNeighbors(nodeId: string, edgeKinds: string[]) {
  const db = await getDb();
  return db.run<any[]>(e.neighbors(nodeId, { edgeKinds }));
}

export async function getEdgesFrom(srcId: string) {
  const db = await getDb();
  return db.run<any[]>(e.select(e.Edge, edge => ({
    id: true, src: { id: true }, dst: { id: true }, kind: true, created_at: true,
    filter: e.op(edge.src, '=', srcId),
  })));
}
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: **all tests pass**, zero raw SQL remaining in store layer.

- [ ] **Step 3: Verify no raw SQL in store layer**

```bash
grep -r "pglite\.\(query\|exec\)" store/
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add store/edges.ts
git commit -m "feat(phase-7): replace store/edges.ts with EdgeLite calls — Phase 7 complete"
```

---

### Phase 7 Deliverable Verification

- [ ] `bun test` — all memtree tests pass.
- [ ] `grep -r "pglite" store/` — no matches.
- [ ] `dbschema/schema.esdl` and `dbschema/migrations/00001-init.sql` are committed.
