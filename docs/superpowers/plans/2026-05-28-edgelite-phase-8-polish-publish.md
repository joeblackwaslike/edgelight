# EdgeLite Phase 8 — Polish + Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Deferred from Phase 7:** `StoreBackend.searchSemantic` in the EdgeLite backend throws `NotImplemented` for now. Phase 8 must wire up PGlite's native `vector` column support (pgvector extension) so the EdgeLite backend can satisfy the `searchSemantic(vector, filters?, limit?)` contract. The SQLite backend already implements this via the `nodes_vec` table.

**Goal:** Prepare EdgeLite for public release: write a README with a 5-minute quickstart and SDL reference, finalize `package.json` exports, confirm `npm publish --dry-run` passes cleanly, and tag version `0.1.0`.

**Architecture:** No new source code. This phase is documentation, packaging configuration, and release verification. The README is the primary deliverable — it should let a new engineer install the package and run their first query in under 5 minutes.

**Tech Stack:** Bun, Markdown, npm/bun publish, git tags

---

## Files

- Create: `README.md` — quickstart, SDL reference, query builder cheatsheet, migration guide
- Modify: `package.json` — finalize `exports`, `files`, `keywords`, `engines`
- Verify: `npm publish --dry-run` passes

---

### Task 1: Finalize package.json for publishing

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Finalize package.json**

Do NOT replace the entire file. Apply only targeted updates to the existing `package.json` (which already has correct devDependencies, lint-staged, biome/eslint config from the initial scaffold):

```diff
-  "name": "edgelight",
+  "name": "edgelite",
```

Ensure `"exports"` contains the `./codegen` subpath (added in Phase 0):
```json
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./codegen": {
      "import": "./dist/codegen/builders.js",
      "types": "./dist/codegen/builders.d.ts"
    }
  },
```

Ensure `"files"` is present:
```json
  "files": ["dist", "cli", "README.md", "LICENSE"],
```

Ensure `"bin"` is present (added in Phase 0):
```json
  "bin": { "edgelite": "./cli/index.ts" },
```

Ensure `"engines"` matches the existing Node target (`>=22`, not a Bun version):
```json
  "engines": { "node": ">=22" },
```

Ensure `"prepublishOnly"` in `"scripts"` builds before publish:
```json
  "prepublishOnly": "pnpm build && pnpm typecheck"
```

Keywords to add:
```json
  "keywords": ["edgedb", "pglite", "postgres", "query-builder", "schema", "migrations", "typescript"],
```

- [ ] **Step 2: Typecheck and build**

```bash
pnpm typecheck && pnpm build
```

Expected: exits 0, `dist/` populated.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(phase-8): finalize package.json exports and publish config"
```

---

### Task 2: Write the README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README — quickstart section**

```markdown
# EdgeLite

EdgeDB-style developer experience on [PGlite](https://pglite.dev) — SDL schema, TypeScript query builder, migration CLI. No server, no concurrency, single data directory on disk.

## Install

```bash
bun add edgelite
```

## 5-minute quickstart

**1. Write your schema** — `dbschema/schema.esdl`

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

**2. Generate the query builder**

```bash
bunx edgelite codegen dbschema/schema.esdl
# → generates dbschema/edgelite.ts
```

**3. Create and apply the initial migration**

```bash
bunx edgelite migration create   # generates dbschema/migrations/00001-*.sql
bunx edgelite migration apply    # applies it to your local PGlite DB
```

**4. Query**

```typescript
import { openDb } from 'edgelite';
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
```

- [ ] **Step 2: Write README — SDL reference section**

```markdown
## SDL Reference (v1)

### Scalar types

| SDL type | Postgres type |
|---|---|
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
```

- [ ] **Step 3: Write README — query builder cheatsheet**

```markdown
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
```

- [ ] **Step 4: Write README — migration guide section**

```markdown
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
```

- [ ] **Step 5: Commit README**

```bash
git add README.md
git commit -m "docs(phase-8): README — quickstart, SDL reference, query builder cheatsheet, migration guide"
```

---

### Task 3: Verify publish readiness

**Files:**
- No changes needed

- [ ] **Step 1: Run full test suite one final time**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Build**

```bash
pnpm build
```

Expected: `dist/` populated, exits 0.

- [ ] **Step 3: Dry-run publish**

```bash
npm publish --dry-run
```

Expected: lists files that would be published (`dist/`, `cli/`, `README.md`, `LICENSE`). No errors.

- [ ] **Step 4: Tag version 0.1.0**

```bash
git tag v0.1.0
git push origin main --tags
```

Expected: tag pushed to remote.

- [ ] **Step 5: Final commit**

```bash
git commit --allow-empty -m "chore: release v0.1.0"
```

---

### Phase 8 Deliverable Verification

- [ ] `npm publish --dry-run` exits 0 and includes `dist/`, `cli/`, `README.md`.
- [ ] `bun test` — all tests pass.
- [ ] `git tag` shows `v0.1.0`.
- [ ] README covers: install, 5-minute quickstart, SDL reference, query builder cheatsheet, migration guide.
