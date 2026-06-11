# EdgeLite

[![npm](https://img.shields.io/npm/v/@edgelite/edgelite)](https://npmjs.com/package/@edgelite/edgelite)
[![CI](https://github.com/joeblackwaslike/edgelite/actions/workflows/ci.yml/badge.svg)](https://github.com/joeblackwaslike/edgelite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

EdgeDB-style developer experience on [PGlite](https://pglite.dev) — SDL schema, TypeScript query builder, migration CLI. No server, no concurrency, single data directory on disk.

## Install

```bash
bun add @edgelite/edgelite
```

## 5-minute quickstart

### 1. Write your schema — `dbschema/schema.esdl`

```sdl
scalar type NodeKind extending enum<note, file_chunk>;
scalar type NodeStatus extending enum<pending, live, pruned>;

type Node {
  required kind:       NodeKind;
  required status:     NodeStatus { default := 'pending' };
  required content:    str        { default := '' };
  required created_at: int64;
  required updated_at: int64;
}
```

### 2. Generate the query builder

```bash
bunx edgelite codegen dbschema/schema.esdl
# → generates dbschema/edgelite.ts
```

### 3. Create and apply the initial migration

```bash
bunx edgelite migration create   # generates dbschema/migrations/00001-*.sql
bunx edgelite migration apply    # applies it to your local PGlite DB
```

### 4. Query

```typescript
import { openDb } from '@edgelite/edgelite';
import e from './dbschema/edgelite.js';

const db = await openDb('./my-db', './dbschema/schema.esdl', { autoMigrate: true });

// Insert
const node = await db.run(e.insert(e.Node, {
  kind: 'note', content: 'hello world',
  created_at: Date.now(), updated_at: Date.now(),
}));

// Select
const notes = await db.run(e.select(e.Node, n => ({
  id: true, content: true, status: true,
  filter: e.op(n.kind, '=', 'note'),
})));

// Update
await db.run(e.update(e.Node, n => ({
  filter: e.op(n.id, '=', node.id),
  set: { status: 'live', updated_at: Date.now() },
})));

// Count
const pending = await db.run(e.count(e.Node, n => ({
  filter: e.op(n.status, '=', 'pending'),
})));

await db.close();
```

## SDL Reference (v1)

### Scalar types

| SDL type | Postgres type |
| --- | --- |
| `str` | `TEXT` |
| `int64` | `BIGINT` |
| `bool` | `BOOLEAN` |
| `json` | `JSONB` |
| `vector(N)` | `vector(N)` (pgvector) |

### Enums

```sdl
scalar type Status extending enum<pending, live, pruned>;
```

Enums are enforced at the TypeScript layer only (no DB `CHECK` constraint). Passing an invalid value to the generated query builder is a compile error.

### Properties

```sdl
type Node {
  required content: str;              # NOT NULL
  source_uri:       str;              # nullable
  required mtime:   int64 { default := 0 };  # with default
}
```

### Links (foreign keys)

```sdl
type Node {
  parent: Node;  # → parent_id TEXT REFERENCES nodes(id)
}
```

One level of link traversal is supported in `select`:

```typescript
db.run(e.select(e.Node, n => ({
  id: true, content: true,
  parent: { id: true },  // joins nodes table once
  filter: e.op(n.status, '=', 'live'),
})));
```

### Indexes

```sdl
index fts on (.content);              # full-text search via tsvector
index vec on (.embedding) using ivfflat;  # pgvector approximate NN
```

### Constraints

```sdl
constraint exclusive on ((.src, .dst, .kind));  # → UNIQUE(src_id, dst_id, kind)
```

## Query Builder Cheatsheet

```typescript
import e from './dbschema/edgelite.js';

// SELECT
e.select(e.Node, n => ({
  id: true, content: true,
  parent: { id: true },            // link traversal (one level)
  filter: e.op(n.status, '=', 'live'),
  order_by: { expr: n.created_at, dir: 'DESC' },
  limit: 20,
}))

// INSERT
e.insert(e.Node, { kind: 'note', content: 'hello', ... })

// INSERT OR IGNORE (unique constraint)
e.insert(e.Edge, { src: id1, dst: id2, kind: 'derived_from', ... }).unlessConflict()

// UPDATE
e.update(e.Node, n => ({
  filter: e.op(n.id, '=', id),
  set: { status: 'pruned', updated_at: Date.now() },
}))

// COUNT
e.count(e.Node, n => ({ filter: e.op(n.status, '=', 'pending') }))

// FILTER HELPERS
e.all(e.op(n.status, '=', 'live'), e.op(n.kind, '=', 'note'))  // AND
e.any(e.op(n.status, '=', 'stale'), e.op(n.status, '=', 'pruned'))  // OR

// NEIGHBORS (bidirectional edge traversal)
e.neighbors(nodeId, { edgeKinds: ['derived_from', 'references'] })

// FULL-TEXT SEARCH
e.fts(e.Node, 'search term')
```

## Migrations

```bash
edgelite migration create   # diff schema.esdl vs DB → writes dbschema/migrations/000N-*.sql
edgelite migration apply    # apply pending non-destructive migrations
edgelite migration apply --allow-destructive  # also apply DROP TABLE / DROP COLUMN
edgelite migration status   # list applied vs pending (⚠ warns on DESTRUCTIVE)
```

Migrations are explicit, numbered `.sql` files committed to git. `migration create` never modifies your DB — it only writes a file.

### autoMigrate

```typescript
// Applies committed pending migrations on open (skips DESTRUCTIVE ones)
const db = await openDb('./my-db', './schema.esdl', { autoMigrate: true });
```

`autoMigrate: true` is safe for plugins and local tools. It never generates migration files.

### Destructive migrations

Migrations that contain `DROP TABLE` or `DROP COLUMN` are marked with a `-- DESTRUCTIVE` header. They are skipped by `autoMigrate` and plain `migration apply`. Apply them explicitly after backing up your data directory:

```bash
cp -r ./my-db ./my-db-backup
edgelite migration apply --allow-destructive
```

## License

[MIT](LICENSE) © 2026 [Joe Black](https://github.com/joeblackwaslike)
