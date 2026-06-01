# EdgeLite Design Spec

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** v1 — memtree-scoped, standalone npm package  

---

## Overview

EdgeLite is a TypeScript library that brings EdgeDB-style developer experience to Claude Code plugins and other Node.js/Bun tools — with no server, no concurrency, and a single data directory on disk.

It is built on PGlite (WASM Postgres), provides an SDL schema language, a TypeScript query builder generated from that schema, a runtime SQL compiler, and a migration CLI. The query builder API is modeled after edgedb-js.

**Primary consumer:** memtree (the reference implementation).  
**Distribution:** standalone npm package (`edgelite`). memtree is the first consumer, not the only one.  
**Runtime:** Bun (Node.js compatible).  
**Storage:** single PGlite data directory, no network, no concurrency — `db.run()` is sequential. (PGlite on Node.js/Bun stores data in a Postgres-style directory, not a single file like SQLite. Pass a directory path, e.g. `'./memtree-db'`.)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| API surface | TypeScript query builder (codegen) | Fullest type safety; closest to EdgeDB DX |
| Schema source of truth | SDL (`.esdl` files) | Matches EdgeDB workflow; codegen reads SDL |
| Migration strategy | EdgeDB-style CLI (`migration create` / `migration apply`) | Explicit, auditable, git-committable |
| Distribution | Standalone npm package from day one | memtree is consumer #1, not the owner |
| Query scope | Exactly memtree's 15 patterns, with clean extension points | YAGNI — expand in v1.1 |
| Implementation language | Pure TypeScript | No Rust/WASM needed; Gel's Rust is server-side |
| Enum enforcement | App-layer only (no DB `CHECK` constraint) | Query builder is the only write path; TS types enforce validity at compile time |
| Link depth | One level deep in v1 | Covers all memtree traversals; deeper nesting deferred |

---

## Architecture & Module Boundaries

```
edgelite/
├── src/
│   ├── parser/       # SDL lexer + parser → AST
│   ├── compiler/     # AST → Postgres DDL
│   ├── codegen/      # AST → TypeScript query builder (dbschema/edgelite.ts)
│   ├── runtime/      # Builder objects → SQL → PGlite execution
│   ├── migration/    # SDL diff → numbered .sql files, apply migrations
│   └── db.ts         # openDb() / closeDb() — public entry point
├── cli/
│   └── index.ts      # edgelite codegen | migration create | migration apply | migration status
├── dbschema/         # generated — never hand-edited; gitignored except migrations/
│   ├── edgelite.ts   # generated query builder (gitignored)
│   └── migrations/   # numbered .sql files (committed to git)
└── index.ts          # public re-exports: openDb, closeDb, error types
```

**Data flow:**

```
schema.esdl
    │
    ▼
[parser]  →  SDL AST
    │              │
    ▼              ▼
[compiler]      [codegen]
Postgres DDL    dbschema/edgelite.ts
    │              │
    ▼              ▼
[migration]   consumer code
applies DDL      │
to PGlite        ▼
              [runtime]
           builder → SQL → PGlite → result objects
```

**Constraints baked into the architecture:**
- `openDb()` returns a single `Db` handle — no pool, no concurrency
- PGlite is initialized with `pgvector` and `pg_trgm` extensions on open
- `dbschema/edgelite.ts` is always generated, never hand-edited (like `node_modules`)
- CLI is a separate entry point — runtime has zero CLI dependencies

---

## SDL Subset (v1)

The parser handles exactly this SDL surface — no more.

### Memtree's reference schema

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
  # Queried metadata keys promoted to typed properties (no json_extract needed)
  session_id:              str;        # set on kind = 'session' nodes
  file_path:               str;        # set on kind = 'file_chunk' nodes
  # Vector embedding — dimension fixed at codegen time via SDL annotation
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

> **Schema contract:** This SDL block is the complete, authoritative enum contract for v1. Any implementation of memtree must use exactly these `NodeKind` and `EdgeKind` values — no additional values are permitted without a spec update and a new migration. This spec is the source of truth; the implementation must match it, not the other way around.

### Supported constructs

| Construct | v1 | Notes |
|---|---|---|
| `type` declarations | ✅ | |
| `scalar type extending enum<...>` | ✅ | |
| `required` / optional properties | ✅ | |
| `default :=` (scalar literals only) | ✅ | |
| Single `link` (to another type) | ✅ | |
| `constraint exclusive on (...)` | ✅ | → UNIQUE constraint |
| `index fts on (...)` | ✅ | → tsvector + GIN + trigger |
| `index vec on (...) using ivfflat` | ✅ | → pgvector column + ivfflat index |
| Scalar types: `str`, `int64`, `bool`, `json` | ✅ | |
| `vector(N)` scalar type | ✅ | maps to pgvector `vector(N)` column |
| `abstract type`, `extending`, `computed` | ❌ | v1.1 |
| `multi link` | ❌ | v1.1 |
| `module`, `alias`, `function`, `access policy` | ❌ | future |

### SDL → DDL mapping

| SDL | Postgres DDL |
|---|---|
| `type Foo` | `CREATE TABLE foos (id TEXT PRIMARY KEY, ...)` |
| `required prop: str` | `prop TEXT NOT NULL` |
| `optional prop: str` | `prop TEXT` |
| `default := 'x'` | `DEFAULT 'x'` |
| `link parent: Node` | `parent_id TEXT REFERENCES nodes(id)` |
| `enum<a, b, c>` | No DB constraint (app-layer only — see Enum Enforcement) |
| `constraint exclusive on ((x, y, z))` | `UNIQUE(x_id, y_id, z)` |
| `index fts on (.content)` | `fts_vector TSVECTOR` column + GIN index on `fts_vector` + INSERT/UPDATE trigger populating `fts_vector` from `.content` |
| `vector(N)` property | `embedding vector(N)` column (pgvector) |
| `index vec on (.embedding) using ivfflat` | ivfflat index on the `vector(N)` column |

### Enum enforcement

Postgres `CHECK` constraints for enums are painful to migrate (DROP + ADD, not transactional). Postgres native `ENUM` types are worse — values cannot be removed without DROP/RECREATE.

**v1 decision:** enums are enforced at the TypeScript layer only. The generated TypeScript query builder produces strict enum types — passing an invalid value is a compile error when writing through the generated API. v1 does not enforce enum values at the DB level (no `CHECK` constraint) and does not protect against raw SQL, direct PGlite access, or external writes to the data directory. No DB-level constraint is emitted.

`{ strictEnums: true }` option reserved for v1.1 — will use a reference table (FK) for consumers who expose raw SQL access and need DB-level enforcement.

---

## Query Builder API

Codegen produces `dbschema/edgelite.ts`. Consumers import `e` from it.

### The six primitives

```typescript
import { openDb } from 'edgelite';
import e from './dbschema/edgelite';

const db = await openDb('./memtree-db', './schema.esdl', { autoMigrate: true });

// SELECT — with filter, link traversal, order, limit
db.run(e.select(e.Node, n => ({
  id: true, content: true, status: true,
  parent: { id: true },                        // one-level link traversal
  filter: e.op(n.status, '=', 'live'),
  order_by: { expr: n.created_at, dir: 'DESC' },
  limit: 1,
})));

// INSERT
db.run(e.insert(e.Node, {
  kind: 'session', content: '', status: 'live',
  created_at: Date.now(), updated_at: Date.now(),
  mtime: 0, truncated: false, original_bytes: 0,
}));

// INSERT OR IGNORE
db.run(e.insert(e.Edge, { src: srcId, dst: dstId, kind: 'derived_from' })
  .unlessConflict());

// UPDATE
db.run(e.update(e.Node, n => ({
  filter: e.op(n.id, '=', id),
  set: { status: 'pruned', content: '', updated_at: Date.now() },
})));

// COUNT
db.run(e.count(e.Node, n => ({
  filter: e.op(n.status, '=', 'pending'),
})));

// MULTI-FILTER helpers
e.all(e.op(n.status, '=', 'live'), e.op(n.mtime, '!=', 0))   // AND
e.any(e.op(...), e.op(...))                                    // OR
e.op(n.updated_at, '<', cutoffMs)                              // comparison
```

### Special-purpose helpers

```typescript
// Bidirectional neighbor lookup
db.run(e.neighbors(nodeId, { edgeKinds: ['derived_from', 'references'] }));

// Full-text search
db.run(e.fts(e.Node, 'search term'));
```

### Memtree query pattern mapping

| memtree function | EdgeLite call |
|---|---|
| `insertNode` | `e.insert(e.Node, data)` |
| `getNode` | `e.select` filter `id =` |
| `updateNodeStatus` | `e.update` set `status`, `updated_at` |
| `getNodeBySourceUri` | `e.select` filter `source_uri =` + `status = live`, limit 1 |
| `getNodeByContentHash` | `e.select` filter `content_hash =` + `status = live`, limit 1 |
| `listChildren` | `e.select` filter `parent.id =` + `status =`, order `created_at` |
| `getOrCreateSessionNode` | `e.select` filter `session_id =` + `kind = session`, then `e.insert` |
| `markStaleByFilePath` | `e.update` filter `file_path =` + `mtime !=` + `status =` |
| `insertEdge` | `e.insert(e.Edge, ...).unlessConflict()` |
| `getNeighbors` | `e.neighbors(id, { edgeKinds })` |
| `getEdgesFrom` | `e.select(e.Edge, e => ({ filter: e.op(e.src.id, '=', id) }))` |
| `countPendingNodes` | `e.count(e.Node, n => ({ filter: ... }))` |
| `getPendingNodes` | `e.select` filter `status = pending`, order, limit |
| `getLiveFileChunks` | `e.select` multi-filter with `e.all(...)` |
| `pruneNode` / `getStaleNodes` / `getSupersededNodes` | `e.update` / `e.select` status filters |

---

## Runtime SQL Compilation

### Pipeline

```
db.run(query)
  ↓
compile(query)  →  { sql: string, params: unknown[] }
  ↓
pglite.query(sql, params)
  ↓
mapResult(rows, query.shape)  →  typed result objects
```

### SQL output per query type

```sql
-- SELECT with link traversal
SELECT n.id, n.status, p.id AS parent__id
FROM nodes n
LEFT JOIN nodes p ON p.id = n.parent_id
WHERE n.status = $1
ORDER BY n.created_at DESC
LIMIT $2

-- INSERT
INSERT INTO nodes (kind, content, status, ...)
VALUES ($1, $2, $3, ...)
RETURNING *

-- INSERT OR IGNORE
INSERT INTO edges (src_id, dst_id, kind, created_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT DO NOTHING
RETURNING *

-- UPDATE
UPDATE nodes SET status = $1, updated_at = $2
WHERE id = $3

-- COUNT
SELECT COUNT(*)::int FROM nodes WHERE status = $1

-- NEIGHBORS (bidirectional)
SELECT DISTINCT n.* FROM nodes n
JOIN edges e
  ON (e.src_id = $1 AND e.dst_id = n.id)
  OR (e.dst_id = $1 AND e.src_id = n.id)
WHERE n.status = 'live'
  AND e.kind = ANY($2::text[])

-- FTS
SELECT n.*, ts_rank(n.fts_vector, q) AS rank
FROM nodes n, plainto_tsquery('english', $1) q
WHERE n.fts_vector @@ q
ORDER BY rank DESC
```

### Result mapping

Link traversal uses `__` as a path separator in column aliases. The mapper reconstructs nesting:

```
SQL row:  { id: 'abc', status: 'live', parent__id: 'xyz' }
         ↓ mapResult()
Result:   { id: 'abc', status: 'live', parent: { id: 'xyz' } }
```

Null parent → `parent: null`. One level deep only in v1.

### Invariants

1. **Always parameterized** — `$1`, `$2` only. No string interpolation.
2. **Always `RETURNING *` on writes** — inserts return the full row; no follow-up SELECT needed.
3. **Sequential execution** — `db.run()` is awaited in order. Concurrent calls throw `EdgeLiteConcurrencyError`.

### Error types

```typescript
EdgeLiteParseError        // SDL parse failure
EdgeLiteCompileError      // bad query shape, caught before PGlite
EdgeLiteRuntimeError      // PGlite error, wraps original
EdgeLiteSchemaError       // schema drift detected on openDb()
EdgeLiteConcurrencyError  // db.run() called while another query is in flight
```

---

## Migration System

### CLI commands

```bash
edgelite codegen                         # SDL → dbschema/edgelite.ts
edgelite migration create                # diff SDL vs DB → new .sql file
edgelite migration apply                 # apply pending non-destructive migrations
edgelite migration apply --allow-destructive  # also apply DESTRUCTIVE-marked migrations
edgelite migration status                # show applied vs pending (warns on DESTRUCTIVE)
```

### File layout

```
dbschema/
  schema.esdl                    # hand-written, source of truth
  migrations/
    00001-init.sql               # generated, committed to git
    00002-add-web-chunk.sql      # generated, committed to git
```

### How `migration create` works

```
Parse schema.esdl → SDL AST
         ↓
Introspect PGlite via information_schema
         ↓
Diff: SDL vs current DB state
         ↓
Emit SQL → dbschema/migrations/000N-<hash>.sql
```

### Diff coverage

| Change | Generated SQL |
|---|---|
| New type | `CREATE TABLE ...` |
| Removed type | `DROP TABLE ...` _(marked DESTRUCTIVE — see policy below)_ |
| New property | `ALTER TABLE ... ADD COLUMN ...` |
| Removed property | `ALTER TABLE ... DROP COLUMN ...` _(marked DESTRUCTIVE — see policy below)_ |
| New enum value | Rebuild `CHECK` constraint (only when `strictEnums: true`) |
| New index | `CREATE INDEX ...` |
| New constraint | `ALTER TABLE ... ADD CONSTRAINT ...` |

### Destructive migration policy

`migration create` adds a `-- DESTRUCTIVE` header comment to any generated file that contains `DROP TABLE` or `DROP COLUMN`. These files are never auto-applied by `autoMigrate: true` — they are skipped and listed as warnings in `migration status` output. To apply a destructive migration, the operator must run:

```bash
edgelite migration apply --allow-destructive
```

v1 provides no automatic backup before destructive applies. Copy the data directory manually before running destructive migrations.

### Migration tracking table

```sql
CREATE TABLE _edgelite_migrations (
  name       TEXT PRIMARY KEY,   -- e.g. '00001-init'
  applied_at INTEGER NOT NULL    -- epoch ms
);
```

Created automatically on first `migration apply`.

### `openDb()` modes

```typescript
// Default: strict — throws EdgeLiteSchemaError if any unapplied migration exists,
// including DESTRUCTIVE-marked ones. Resolve with migration apply [--allow-destructive].
await openDb('./db', './schema.esdl');

// Plugin convenience: auto-applies committed pending migrations on open
await openDb('./db', './schema.esdl', { autoMigrate: true });
```

**`autoMigrate` contract:** `autoMigrate: true` applies committed pending migrations only — it runs `migration apply` on open and throws `EdgeLiteSchemaError` if any pending file fails. Migrations marked `-- DESTRUCTIVE` are **skipped** by `autoMigrate`; they must be applied explicitly with `edgelite migration apply --allow-destructive`. It never generates migration files at runtime. New migration files must always be created explicitly via `edgelite migration create` and committed to git before they can be applied.

### The web_chunk example

The 30-line table-drop-and-recreate workaround in memtree's current `db.ts` becomes:

```bash
# 1. Add web_chunk to NodeKind enum in schema.esdl
# 2. edgelite migration create  → generates 00002-add-web-chunk.sql
# 3. edgelite migration apply   → applies it
```

---

## Phase Breakdown

**Critical path:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8  
**Parallelizable:** Phases 1 and 2 can run in parallel. Phases 3 and 4 can overlap.  
**Total estimate:** ~2 weeks with Claude Code.

---

### Phase 0 — Repo scaffolding (~2 hours)

- `package.json`, `tsconfig.json`, bun setup
- Directory structure: `src/`, `cli/`, `dbschema/migrations/`
- GitHub Actions CI: typecheck + test on push
- `.gitignore`: excludes `dbschema/edgelite.ts`, `*-db/` (PGlite data directories)
- **Deliverable:** `bun run build` and `bun test` pass on empty project

---

### Phase 1 — PGlite core (~1 day)

- Install `@electric-sql/pglite` with `pgvector` and `pg_trgm` extensions
- `openDb(filePath, schemaPath, opts)` — creates dir, loads extensions, returns `Db` handle
- `closeDb(db)` — graceful shutdown
- `_edgelite_migrations` tracking table created on first open
- `autoMigrate` option wired (does nothing until Phase 6)
- **Deliverable:** `openDb('./test-db', './schema.esdl')` opens a real PGlite data directory

---

### Phase 2 — SDL parser (~2 days)

*Can run in parallel with Phase 1.*

- `peggy` grammar covering the full v1 SDL subset
- Typed AST: `ObjectTypeNode`, `PropertyNode`, `LinkNode`, `EnumNode`, `IndexNode`, `ConstraintNode`
- Round-trip test: parses memtree's `schema.esdl` without errors
- **Deliverable:** `parseSdl(source)` returns validated AST or throws `EdgeLiteParseError`

---

### Phase 3 — SDL → DDL compiler (~2 days)

*Depends on Phase 2.*

- AST → `CREATE TABLE` per `ObjectType`
- `required` → `NOT NULL`; optional → nullable
- `default` → `DEFAULT` clause (scalar literals only)
- `link` → FK column (`{name}_id TEXT REFERENCES {table}(id)`)
- `constraint exclusive on (x, y)` → `UNIQUE(x_id, y_id, kind)`
- `index fts` → `fts_vector TSVECTOR` column + GIN index + INSERT/UPDATE trigger
- `index vec ... using ivfflat` → `vector(dim)` column + ivfflat index
- Enum values: no DB constraint emitted (app-layer only)
- **Deliverable:** `compileSdl(ast)` returns array of SQL strings ready to execute

---

### Phase 4 — Query builder codegen (~2 days)

*Depends on Phase 2. Can overlap with Phase 3.*

- `edgelite codegen` reads `schema.esdl`, writes `dbschema/edgelite.ts`
- Exports: `e.Node`, `e.Edge`, all enum const objects
- Builder factories: `e.select()`, `e.insert()`, `e.update()`, `e.count()`
- Helpers: `e.op()`, `e.all()`, `e.any()`, `e.neighbors()`, `e.fts()`
- `.unlessConflict()` on `InsertBuilder`
- All return opaque builder objects (no SQL generated here)
- **Deliverable:** `edgelite codegen` on memtree's schema produces a valid, fully-typed `dbschema/edgelite.ts`

---

### Phase 5 — Runtime SQL compiler (~3 days)

*Depends on Phases 1 and 4.*

- `db.run(query)` dispatches to per-type compiler
- `SelectCompiler`: WHERE clause, LEFT JOINs for links, ORDER BY, LIMIT
- `InsertCompiler`: column list + `$N` params + `RETURNING *`
- `UpdateCompiler`: SET clause + WHERE
- `CountCompiler`: `SELECT COUNT(*)::int`
- `NeighborCompiler`: bidirectional JOIN
- `FtsCompiler`: `plainto_tsquery` + `ts_rank` ORDER BY
- `ResultMapper`: `parent__id` → `{ parent: { id } }` reconstruction
- All parameterized — `$1`, `$2` only
- **Deliverable:** all 15 memtree query patterns execute correctly against PGlite

---

### Phase 6 — Migration CLI (~2 days)

*Depends on Phases 1 and 3.*

- `migration create`: introspects via `information_schema`, diffs vs SDL AST, writes `000N-<hash>.sql`
- `migration apply`: runs pending files in order, records in `_edgelite_migrations`
- `migration status`: lists applied vs pending
- Diff handles: add/drop table, add/drop column, add/drop index, add/drop unique constraint
- `autoMigrate: true` wired through to `openDb()`
- **Deliverable:** adding `web_chunk` to `schema.esdl` → create → apply works end to end

---

### Phase 7 — memtree integration (~2 days)

*Depends on Phases 5 and 6.*

- `schema.esdl` for memtree committed to edgelite repo as reference schema
- In memtree: `bun add edgelite`, run `edgelite codegen`
- Replace `store/db.ts`, `store/nodes.ts`, `store/edges.ts` with EdgeLite calls
- All 15 query patterns verified against existing memtree tests
- `autoMigrate: true` in memtree's `openDb()` call
- **Deliverable:** memtree test suite passes with zero raw SQL remaining in store layer

---

### Phase 8 — Polish + publish (~1 day)

*Depends on Phase 7.*

- README: 5-minute quickstart, SDL reference, query builder cheatsheet
- `exports` field in `package.json`: `edgelite`, `edgelite/cli`
- `npm publish --dry-run` passes
- Version `0.1.0` tagged
- **Deliverable:** `npm install edgelite` works from a fresh project

---

## Field-Name Contract

This table is the single source of truth for how a name travels from SDL → AST → Postgres → builder API → SQL. Every phase that touches a name must follow this table exactly. Contract drift between phases is the most common source of bugs.

| SDL declaration | AST node | DB column name | Builder input key | Runtime SQL column |
|---|---|---|---|---|
| `required content: str` | `PropertyNode{name:'content'}` | `content` | `content` | `n.content` |
| `optional source_uri: str` | `PropertyNode{name:'source_uri'}` | `source_uri` | `source_uri` | `n.source_uri` |
| `link parent: Node` | `LinkNode{name:'parent', targetType:'Node'}` | `parent_id` | `parent` (remapped via `_links`) | FK: `n.parent_id`; JOIN alias: `p.id AS parent__id` |
| `required link src: Node` | `LinkNode{name:'src', targetType:'Node'}` | `src_id` | `src` (remapped via `_links`) | `n.src_id` |
| `e.insert(e.Node, {parent: id})` | — | `parent_id` | `parent` | `INSERT ... (parent_id) VALUES ($N)` |
| `e.select(e.Edge, e => ({src: {id:true}}))` | — | — | `src` → JOIN on `src_id` | `LEFT JOIN nodes src ON src.id = n.src_id` |
| `e.op(n.parent, '=', id)` | — | `parent_id` | `n.parent` → resolves to `n.parent_id` via ref proxy | `WHERE n.parent_id = $N` |
| `constraint exclusive on (.src, .dst, .kind)` | `ExclusiveConstraintNode{properties:['src','dst','kind']}` | `UNIQUE(src_id, dst_id, kind)` | — | — |
| `index fts on (.content)` | `FtsIndexNode{property:'content'}` | `fts_vector TSVECTOR` (separate column) | — | `fts_vector @@ plainto_tsquery(...)` |

### Cross-phase invariants

1. **Link columns always use `_id` suffix in Postgres.** `link parent` → `parent_id TEXT REFERENCES`. No exceptions.
2. **Builder inputs use the SDL name (no `_id`).** `e.insert(e.Node, {parent: id})` — the `_id` mapping is the codegen's job via `_links` metadata.
3. **`_links` is the bridge.** Every TypeHandle object (`e.Node`, `e.Edge`) carries `_links: readonly string[]` listing all link field names. The runtime uses this to remap `{parent: id}` → column `parent_id`, and the ref proxy uses it to emit `parent_id` in filter/order-by FieldRefs.
4. **`compileConstraint` is link-aware.** It receives the enclosing type's link name set and appends `_id` only to link properties, not scalars.
5. **The ref proxy is link-aware.** `makeRef(table, links)` converts `proxy.parent` → `{column: 'parent_id'}` so filter expressions compile to the correct column name.
6. **FTS column name is always `fts_vector`.** Not derived from the SDL property name — it is always `fts_vector` regardless of which property the index covers.

---

## Out of Scope for v1

- `abstract type`, `extending`, `computed` properties
- `multi link`
- `module`, `alias`, `function`, `access policy`
- Link traversal deeper than one level
- Transactions / savepoints
- Concurrent access
- `strictEnums: true` reference table implementation
- Vector search query builder method (pgvector accessible via Phase 5 runtime, no codegen helper yet)
- Full EdgeQL spec compliance
