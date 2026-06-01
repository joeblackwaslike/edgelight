# EdgeLite Phase 7 (Revised) — Memtree Pluggable Store Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Supersedes:** `docs/superpowers/plans/2026-05-28-edgelite-phase-7-memtree-integration.md`
> **Design spec:** `docs/superpowers/specs/2026-06-01-memtree-pluggable-backend-design.md`

**Goal:** Replace memtree's hard-wired `bun:sqlite` store with a pluggable `StoreBackend` interface — SQLite backend keeps existing behaviour, EdgeLite backend implements CRUD + FTS via PGlite. All `import { Database } from 'bun:sqlite'` references are removed from every file outside `store/backends/sqlite/`.

**Architecture:** Two backend factory functions (`createSqliteBackend`, `createEdgeliteBackend`) both satisfy a unified async `StoreBackend` interface. `server.ts` picks the backend from `config.backend` (env: `MEMTREE_BACKEND`). Every tool and walker receives `store: StoreBackend` instead of `db: Database`.

**Tech Stack:** Bun, TypeScript, edgelite (local path dep), bun:test

**Working directories:**
- EdgeLite repo: `/Users/joe/github/joeblackwaslike/edgelight/` — Task 1 only
- Memtree MCP package: `/Users/joe/github/joeblackwaslike/memtree/mcp/` — all other tasks

---

## Files

**EdgeLite repo (Task 1 only):**
- Modify: `src/index.ts`

**Memtree repo — new files:**
- Create: `mcp/dbschema/schema.esdl`
- Create: `mcp/dbschema/edgelite.ts` (generated — do not hand-edit)
- Create: `mcp/dbschema/migrations/00001-*.sql` (generated)
- Create: `mcp/src/store/interface.ts`
- Create: `mcp/src/store/backends/sqlite/index.ts`
- Create: `mcp/src/store/backends/sqlite/index.test.ts`
- Create: `mcp/src/store/backends/edgelite/index.ts`
- Create: `mcp/src/store/backends/edgelite/index.test.ts`
- Create: `mcp/src/store/index.ts`
- Create: `mcp/src/store/__tests__/contract.test.ts`

**Memtree repo — modified files:**
- Modify: `mcp/src/store/types.ts`
- Modify: `mcp/src/config.ts`
- Modify: `mcp/src/server.ts`
- Modify: `mcp/src/ingest.ts`
- Modify: `mcp/src/tools/search.ts`
- Modify: `mcp/src/tools/compose.ts`
- Modify: `mcp/src/tools/neighbors.ts`
- Modify: `mcp/src/tools/path-to-root.ts`
- Modify: `mcp/src/tools/recent.ts`
- Modify: `mcp/src/tools/read.ts`
- Modify: `mcp/src/tools/note.ts`
- Modify: `mcp/src/tools/monitor.ts`
- Modify: `mcp/src/tools/bash.ts`
- Modify: `mcp/src/tools/grep.ts`
- Modify: `mcp/src/tools/browse.ts`
- Modify: `mcp/src/walkers/coordinator.ts`
- Modify: `mcp/src/walkers/pruner.ts`
- Modify: `mcp/src/walkers/dedupe.ts`
- Modify: `mcp/src/walkers/staleness.ts`
- Modify: `mcp/src/walkers/embedding.ts`
- Modify: `mcp/src/walkers/summarizer.ts`

---

### Task 1: Wire edgelite public API + build

**Working directory:** `/Users/joe/github/joeblackwaslike/edgelight/`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Export the public API from src/index.ts**

Replace the entire contents of `src/index.ts`:

```typescript
export { openDb, closeDb } from './db.js';
export type { Db } from './types.js';
```

- [ ] **Step 2: Build edgelite**

```bash
cd /Users/joe/github/joeblackwaslike/edgelight
pnpm build
```

Expected: `dist/index.js` and `dist/index.d.ts` are created/updated with no errors.

- [ ] **Step 3: Run edgelite tests to confirm nothing broke**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(phase-7): export openDb, closeDb, Db from public index"
```

---

### Task 2: Install edgelite + generate schema files

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Modify: `package.json`
- Create: `dbschema/schema.esdl`
- Create: `dbschema/edgelite.ts` (generated)
- Create: `dbschema/migrations/00001-*.sql` (generated)

- [ ] **Step 1: Add edgelite as a local dependency**

```bash
cd /Users/joe/github/joeblackwaslike/memtree/mcp
bun add /Users/joe/github/joeblackwaslike/edgelight
```

Expected: `package.json` gains `"edgelite": "file:../../edgelight"` (or similar path).

- [ ] **Step 2: Create dbschema/schema.esdl**

Create `dbschema/schema.esdl` with this exact content:

```sdl
scalar type NodeKind extending enum<
  session, file_chunk, tool_output, summary, note,
  observation, web_chunk, prompt, thinking, response
>;
scalar type NodeStatus extending enum<pending, live, stale, superseded, pruned>;
scalar type EdgeKind extending enum<
  derived_from, references, summarizes, supersedes, follows
>;

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
  summary:                 str;
  parent:                  Node;

  index fts on (.content);
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
cd /Users/joe/github/joeblackwaslike/memtree/mcp
./node_modules/.bin/edgelite codegen dbschema/schema.esdl
```

Expected output:
```
✓ Generated dbschema/edgelite.ts from dbschema/schema.esdl
```

Expected: `dbschema/edgelite.ts` is created. Inspect it briefly — it should export a default `e` object with `e.Node`, `e.Edge`, `e.insert`, `e.select`, `e.update`, `e.count`, `e.op`, `e.all`, `e.fts`, `e.neighbors` etc.

- [ ] **Step 4: Create initial migration**

```bash
./node_modules/.bin/edgelite migration create dbschema/schema.esdl
```

Expected: creates `dbschema/migrations/00001-init.sql` (or similar name with timestamp).

- [ ] **Step 5: Commit**

```bash
cd /Users/joe/github/joeblackwaslike/memtree/mcp
git add dbschema/ package.json bun.lock
git commit -m "feat(phase-7): install edgelite, create schema.esdl + initial migration"
```

---

### Task 3: StoreBackend interface + config types

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Create: `src/store/interface.ts`
- Modify: `src/store/types.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Create src/store/interface.ts**

```typescript
import type { MemtreeNode, MemtreeEdge, NodeStatus, NodeKind, EdgeKind, Filters } from './types.js';

export interface InsertNodeParams {
  parent_id: string | null;
  kind: NodeKind;
  source_uri: string | null;
  content: string;
  content_hash: string;
  status: NodeStatus;
  mtime: number;
  truncated: number;       // 0 | 1
  original_bytes: number;
  metadata: string;        // JSON blob
  summary?: string | null;
}

export interface StoreBackend {
  // ── Core node CRUD ────────────────────────────────────────────────────────
  insertNode(id: string, params: InsertNodeParams): Promise<void>;
  getNode(id: string): Promise<MemtreeNode | null>;
  updateNodeStatus(id: string, status: NodeStatus): Promise<void>;
  getNodeBySourceUri(uri: string): Promise<MemtreeNode | null>;
  getNodeByContentHash(hash: string): Promise<MemtreeNode | null>;
  listChildren(parentId: string, status?: NodeStatus): Promise<MemtreeNode[]>;
  getOrCreateSessionNode(sessionId: string): Promise<MemtreeNode>;
  markStaleByFilePath(filePath: string, mtime: number): Promise<void>;
  countPendingNodes(): Promise<number>;
  getPendingNodes(limit?: number): Promise<MemtreeNode[]>;
  getLiveFileChunks(cutoffMs: number): Promise<MemtreeNode[]>;
  getStaleNodes(olderThanMs: number): Promise<MemtreeNode[]>;
  getSupersededNodes(olderThanMs: number): Promise<MemtreeNode[]>;
  pruneNode(id: string): Promise<void>;
  updateNodeSummary(id: string, summary: string): Promise<void>;

  // ── Edge CRUD ─────────────────────────────────────────────────────────────
  insertEdge(edge: Omit<MemtreeEdge, 'created_at'>): Promise<void>;
  getNeighbors(nodeId: string, edgeKinds?: EdgeKind[]): Promise<MemtreeNode[]>;
  getEdgesFrom(srcId: string): Promise<MemtreeEdge[]>;

  // ── Search ────────────────────────────────────────────────────────────────
  // searchSemantic: vector is pre-computed; backend does cosine-similarity lookup.
  // EdgeLite: throws NotImplemented until Phase 8 wires pgvector.
  searchKeyword(query: string, filters?: Filters, limit?: number): Promise<MemtreeNode[]>;
  searchSemantic(vector: number[], embeddingModel: string, filters?: Filters, limit?: number): Promise<MemtreeNode[]>;

  // ── Complex graph / tool queries (EdgeLite: NotImplemented in Phase 7) ────
  getNodesByIds(ids: string[]): Promise<MemtreeNode[]>;
  getRecentNodes(since?: number, limit?: number, filters?: Filters): Promise<MemtreeNode[]>;
  getPathToRoot(nodeId: string): Promise<MemtreeNode[]>;
  getNeighborsDeep(nodeId: string, depth?: number, edgeKinds?: EdgeKind[], filters?: Filters): Promise<MemtreeNode[]>;
  expandGraph(seedIds: string[], maxDepth: number): Promise<Map<string, number>>;
  getFtsRanks(query: string, ids: string[]): Promise<Map<string, number>>;

  // ── Vector / embedding (EdgeLite: NotImplemented in Phase 7) ─────────────
  getPendingEmbeddingNodes(batchSize: number): Promise<Array<{ id: string; content: string }>>;
  batchUpsertNodeVec(rows: Array<{ id: string; embedding: Buffer; model: string; dim: number; embeddedAt: number }>): Promise<void>;
  getStoredEmbeddingModels(): Promise<string[]>;

  // ── Dedupe walker (EdgeLite: NotImplemented in Phase 7) ───────────────────
  getDedupeCandidatePairs(): Promise<Array<{
    id1: string; id2: string;
    emb1: Uint8Array; emb2: Uint8Array;
    ts1: number; ts2: number;
  }>>;
  markNodeStatusPruned(id: string, now: number): Promise<void>;

  // ── Summarizer walker (EdgeLite: NotImplemented in Phase 7) ───────────────
  getNodesNeedingSummarization(charThreshold: number, limit: number): Promise<Array<{
    id: string; content: string; source_uri: string | null;
  }>>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  close(): Promise<void>;
}
```

- [ ] **Step 2: Add BackendKind + BackendConfig to src/store/types.ts**

Add at the bottom of `src/store/types.ts`, before the final closing:

```typescript
export type BackendKind = 'sqlite' | 'edgelite';

export interface BackendConfig {
  kind: BackendKind;     // env: MEMTREE_BACKEND
  schemaPath?: string;   // edgelite only — env: MEMTREE_SCHEMA_PATH
}
```

Also add `backend?: BackendConfig;` to the `MemtreeConfig` interface (after `trustedExecution`).

- [ ] **Step 3: Update src/config.ts — default + env var resolution**

Add `backend: { kind: 'sqlite' }` to `DEFAULT_CONFIG`:

```typescript
export const DEFAULT_CONFIG: MemtreeConfig = {
  embeddingModel: 'nomic-embed-text',
  summarizerModel: 'llama3.2',
  retention: { staleHours: 24, supersededDays: 7 },
  walkers: {
    embeddingIdleMs: 5000,
    embeddingBatchSize: 32,
    summarizerIdleMs: 30000,
    summarizerSubtreeThreshold: 25,
    dedupeIntervalMs: 60000,
    stalenessIntervalMs: 30000,
    prunerIntervalMs: 300000,
  },
  capture: { maxBytes: 100000, filterMinSize: 50 },
  trustedExecution: false,
  backend: { kind: 'sqlite' },
};
```

At the end of `loadConfig`, apply env var overrides after the JSON merge, before returning:

```typescript
export function loadConfig(projectRoot?: string): MemtreeConfig {
  const globalPath = join(process.env.HOME ?? homedir(), '.memtree', 'config.json');
  const globalOverride = existsSync(globalPath) ? readJson(globalPath) : {};

  const projectPath = projectRoot
    ? join(projectRoot, '.memtree', 'config.json')
    : null;
  const projectOverride = projectPath && existsSync(projectPath)
    ? readJson(projectPath)
    : {};

  let merged = deepMergeConfig(deepMergeConfig(DEFAULT_CONFIG, globalOverride), projectOverride);

  // Env var overrides (highest priority)
  if (process.env.MEMTREE_BACKEND) {
    merged = {
      ...merged,
      backend: { ...merged.backend, kind: process.env.MEMTREE_BACKEND as import('./store/types.js').BackendKind },
    };
  }
  if (process.env.MEMTREE_SCHEMA_PATH) {
    merged = {
      ...merged,
      backend: { ...merged.backend, schemaPath: process.env.MEMTREE_SCHEMA_PATH },
    };
  }

  return merged;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/joe/github/joeblackwaslike/memtree/mcp
bunx tsc --noEmit
```

Expected: no errors from the new interface + config files (there will be errors from callers not yet updated — that is expected at this stage).

- [ ] **Step 5: Commit**

```bash
git add src/store/interface.ts src/store/types.ts src/config.ts
git commit -m "feat(phase-7): StoreBackend interface + BackendConfig in MemtreeConfig"
```

---

### Task 4: SQLite backend

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Create: `src/store/backends/sqlite/index.ts`

The SQLite backend wraps all existing `store/db.ts`, `store/nodes.ts`, `store/edges.ts` functions plus the complex queries currently in tool and walker files.

- [ ] **Step 1: Create src/store/backends/sqlite/index.ts**

```typescript
import { Database } from 'bun:sqlite';
import { statSync } from 'fs';
import { openDb, closeDb } from '../../db.js';
import {
  insertNode as sqlInsertNode,
  getNode as sqlGetNode,
  updateNodeStatus as sqlUpdateNodeStatus,
  getNodeBySourceUri as sqlGetNodeBySourceUri,
  getNodeByContentHash as sqlGetNodeByContentHash,
  listChildren as sqlListChildren,
  getOrCreateSessionNode as sqlGetOrCreateSessionNode,
  markStaleByFilePath as sqlMarkStaleByFilePath,
  countPendingNodes as sqlCountPendingNodes,
  getPendingNodes as sqlGetPendingNodes,
  getLiveFileChunks as sqlGetLiveFileChunks,
  getStaleNodes as sqlGetStaleNodes,
  getSupersededNodes as sqlGetSupersededNodes,
  pruneNode as sqlPruneNode,
} from '../../nodes.js';
import {
  insertEdge as sqlInsertEdge,
  getNeighbors as sqlGetNeighbors,
  getEdgesFrom as sqlGetEdgesFrom,
} from '../../edges.js';
import { buildFilterSQL } from '../../../walkers/filter.js';
import type { StoreBackend, InsertNodeParams } from '../../interface.js';
import type { MemtreeNode, MemtreeEdge, NodeStatus, NodeKind, EdgeKind, Filters } from '../../types.js';

// Cache verified embedding model per Database instance for searchSemantic.
const embeddingModelCache = new WeakMap<Database, string>();

export async function createSqliteBackend(dbPath: string): Promise<StoreBackend> {
  const db = openDb(dbPath);
  return new SqliteBackend(db);
}

class SqliteBackend implements StoreBackend {
  constructor(private readonly db: Database) {}

  // ── Core node CRUD ─────────────────────────────────────────────────────────

  async insertNode(id: string, params: InsertNodeParams): Promise<void> {
    sqlInsertNode(this.db, id, params);
  }

  async getNode(id: string): Promise<MemtreeNode | null> {
    return sqlGetNode(this.db, id);
  }

  async updateNodeStatus(id: string, status: NodeStatus): Promise<void> {
    sqlUpdateNodeStatus(this.db, id, status);
  }

  async getNodeBySourceUri(uri: string): Promise<MemtreeNode | null> {
    return sqlGetNodeBySourceUri(this.db, uri);
  }

  async getNodeByContentHash(hash: string): Promise<MemtreeNode | null> {
    return sqlGetNodeByContentHash(this.db, hash);
  }

  async listChildren(parentId: string, status: NodeStatus = 'live'): Promise<MemtreeNode[]> {
    return sqlListChildren(this.db, parentId, status);
  }

  async getOrCreateSessionNode(sessionId: string): Promise<MemtreeNode> {
    return sqlGetOrCreateSessionNode(this.db, sessionId);
  }

  async markStaleByFilePath(filePath: string, mtime: number): Promise<void> {
    sqlMarkStaleByFilePath(this.db, filePath, mtime);
  }

  async countPendingNodes(): Promise<number> {
    return sqlCountPendingNodes(this.db);
  }

  async getPendingNodes(limit = 100): Promise<MemtreeNode[]> {
    return sqlGetPendingNodes(this.db, limit);
  }

  async getLiveFileChunks(cutoffMs: number): Promise<MemtreeNode[]> {
    return sqlGetLiveFileChunks(this.db, cutoffMs);
  }

  async getStaleNodes(olderThanMs: number): Promise<MemtreeNode[]> {
    return sqlGetStaleNodes(this.db, olderThanMs);
  }

  async getSupersededNodes(olderThanMs: number): Promise<MemtreeNode[]> {
    return sqlGetSupersededNodes(this.db, olderThanMs);
  }

  async pruneNode(id: string): Promise<void> {
    sqlPruneNode(this.db, id);
  }

  async updateNodeSummary(id: string, summary: string): Promise<void> {
    this.db.run('UPDATE nodes SET summary = ?, updated_at = ? WHERE id = ?', summary, Date.now(), id);
  }

  // ── Edge CRUD ──────────────────────────────────────────────────────────────

  async insertEdge(edge: Omit<MemtreeEdge, 'created_at'>): Promise<void> {
    sqlInsertEdge(this.db, edge);
  }

  async getNeighbors(nodeId: string, edgeKinds?: EdgeKind[]): Promise<MemtreeNode[]> {
    return sqlGetNeighbors(this.db, nodeId, edgeKinds);
  }

  async getEdgesFrom(srcId: string): Promise<MemtreeEdge[]> {
    return sqlGetEdgesFrom(this.db, srcId);
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async searchKeyword(query: string, filters: Filters = {}, limit = 20): Promise<MemtreeNode[]> {
    if (!query.trim()) return [];
    const { where, params } = buildFilterSQL(filters);
    try {
      return this.db.query(`
        SELECT n.* FROM nodes n
        JOIN nodes_fts f ON f.id = n.id
        WHERE nodes_fts MATCH ? AND ${where}
        ORDER BY bm25(nodes_fts)
        LIMIT ?
      `).all(query, ...params, limit) as MemtreeNode[];
    } catch {
      return [];
    }
  }

  async searchSemantic(
    vector: number[],
    embeddingModel: string,
    filters: Filters = {},
    limit = 20,
  ): Promise<MemtreeNode[]> {
    // Check model consistency
    const normalizedModel = embeddingModel.replace(/^[^/]+\//, '');
    const cached = embeddingModelCache.get(this.db);
    if (cached !== normalizedModel) {
      const stored = this.db.prepare(
        'SELECT DISTINCT embedding_model FROM nodes_vec LIMIT 2'
      ).all() as { embedding_model: string }[];
      if (
        stored.length > 1 ||
        (stored[0] && stored[0].embedding_model !== normalizedModel)
      ) {
        throw new Error('embedding model mismatch: re-embed required before semantic search');
      }
      embeddingModelCache.set(this.db, normalizedModel);
    }

    const { where, params } = buildFilterSQL(filters);
    const queryFloat = new Float32Array(vector);

    const rows = this.db.query(`
      SELECT v.id, v.embedding FROM nodes_vec v
      JOIN nodes n ON v.id = n.id
      WHERE ${where}
    `).all(...params) as { id: string; embedding: Uint8Array }[];

    if (rows.length === 0) return [];

    const scored = rows.map(row => {
      const stored = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < queryFloat.length; i++) {
        dot += queryFloat[i] * stored[i];
        normA += queryFloat[i] * queryFloat[i];
        normB += stored[i] * stored[i];
      }
      return { id: row.id, sim: dot / (Math.sqrt(normA) * Math.sqrt(normB)) };
    });
    scored.sort((a, b) => b.sim - a.sim);

    const topIds = scored.slice(0, limit).map(r => r.id);
    if (topIds.length === 0) return [];

    const placeholders = topIds.map(() => '?').join(',');
    const nodes = this.db.query(
      `SELECT * FROM nodes WHERE id IN (${placeholders})`
    ).all(...topIds) as MemtreeNode[];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    return topIds.map(id => nodeMap.get(id)).filter((n): n is MemtreeNode => n !== undefined);
  }

  // ── Complex graph / tool queries ───────────────────────────────────────────

  async getNodesByIds(ids: string[]): Promise<MemtreeNode[]> {
    if (ids.length === 0) return [];
    const CHUNK = 999;
    const result: MemtreeNode[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = this.db.query(
        `SELECT * FROM nodes WHERE id IN (${placeholders}) AND status = 'live'`
      ).all(...chunk) as MemtreeNode[];
      result.push(...rows);
    }
    return result;
  }

  async getRecentNodes(since?: number, limit = 50, filters: Filters = {}): Promise<MemtreeNode[]> {
    const effectiveFilters: Filters = { ...filters, ...(since ? { since } : {}) };
    const { where, params } = buildFilterSQL(effectiveFilters);
    return this.db.query(
      `SELECT * FROM nodes WHERE ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as MemtreeNode[];
  }

  async getPathToRoot(nodeId: string): Promise<MemtreeNode[]> {
    const path: MemtreeNode[] = [];
    let current = this.db.query('SELECT * FROM nodes WHERE id = ?').get(nodeId) as MemtreeNode | undefined;
    while (current) {
      path.push(current);
      if (!current.parent_id) break;
      current = this.db.query('SELECT * FROM nodes WHERE id = ?').get(current.parent_id) as MemtreeNode | undefined;
    }
    return path;
  }

  async getNeighborsDeep(
    nodeId: string,
    depth = 1,
    edgeKinds?: EdgeKind[],
    filters: Filters = {},
  ): Promise<MemtreeNode[]> {
    const cap = Math.min(depth, 5);
    const { where, params } = buildFilterSQL(filters, 'n');
    const kindFilter = edgeKinds?.length
      ? `AND e.kind IN (${edgeKinds.map(() => '?').join(',')})`
      : '';
    const kindParams = edgeKinds ?? [];

    const visited = new Set<string>([nodeId]);
    const result: MemtreeNode[] = [];
    let frontier = [nodeId];

    for (let d = 0; d < cap; d++) {
      if (frontier.length === 0) break;
      const placeholders = frontier.map(() => '?').join(',');
      const next = this.db.query(`
        SELECT DISTINCT n.* FROM nodes n
        JOIN edges e ON (e.src_id IN (${placeholders}) AND e.dst_id = n.id)
                     OR (e.dst_id IN (${placeholders}) AND e.src_id = n.id)
        WHERE ${where} ${kindFilter}
      `).all(...frontier, ...frontier, ...params, ...kindParams) as MemtreeNode[];

      const newNodes = next.filter(n => !visited.has(n.id));
      for (const n of newNodes) { visited.add(n.id); result.push(n); }
      frontier = newNodes.map(n => n.id);
    }

    return result;
  }

  async expandGraph(seedIds: string[], maxDepth: number): Promise<Map<string, number>> {
    const visited = new Map<string, number>();
    const queue: [string, number][] = seedIds.map(id => [id, 0]);

    while (queue.length > 0) {
      const [id, dist] = queue.shift()!;
      if (visited.has(id)) continue;
      visited.set(id, dist);
      if (dist >= maxDepth) continue;

      const children = this.db.query(
        "SELECT id FROM nodes WHERE parent_id = ? AND status = 'live'"
      ).all(id) as { id: string }[];

      const edgeNeighbors = this.db.query(`
        SELECT DISTINCT n.id FROM nodes n
        JOIN edges e ON (e.src_id = ? AND e.dst_id = n.id)
                     OR (e.dst_id = ? AND e.src_id = n.id)
        WHERE n.status = 'live'
      `).all(id, id) as { id: string }[];

      for (const { id: nextId } of [...children, ...edgeNeighbors]) {
        if (!visited.has(nextId)) queue.push([nextId, dist + 1]);
      }
    }

    return visited;
  }

  async getFtsRanks(query: string, ids: string[]): Promise<Map<string, number>> {
    if (!query.trim() || ids.length === 0) return new Map();
    const CHUNK = 999;
    let rows: { id: string; rank: number }[] = [];
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        const batch = this.db.query(`
          SELECT n.id, bm25(nodes_fts) AS rank FROM nodes n
          JOIN nodes_fts f ON f.id = n.id
          WHERE nodes_fts MATCH ? AND n.id IN (${placeholders})
          ORDER BY rank
        `).all(query, ...chunk) as { id: string; rank: number }[];
        rows.push(...batch);
      }
    } catch {
      return new Map();
    }
    if (rows.length === 0) return new Map();
    const minRank = Math.min(...rows.map(r => r.rank));
    const maxRank = Math.max(...rows.map(r => r.rank));
    const range = maxRank - minRank || 1;
    return new Map(rows.map(r => [r.id, (maxRank - r.rank) / range]));
  }

  // ── Vector / embedding ─────────────────────────────────────────────────────

  async getPendingEmbeddingNodes(batchSize: number): Promise<Array<{ id: string; content: string }>> {
    return this.db.query<{ id: string; content: string }, [number]>(`
      SELECT n.id, n.content FROM nodes n
      LEFT JOIN nodes_vec v ON n.id = v.id
      WHERE n.status = 'live'
        AND v.id IS NULL
        AND length(n.content) > 0
      LIMIT ?
    `).all(batchSize);
  }

  async batchUpsertNodeVec(
    rows: Array<{ id: string; embedding: Buffer; model: string; dim: number; embeddedAt: number }>
  ): Promise<void> {
    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO nodes_vec (id, embedding, embedding_model, embedding_dim, embedded_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.db.transaction(() => {
      for (const row of rows) {
        upsert.run(row.id, row.embedding, row.model, row.dim, row.embeddedAt);
      }
    })();
  }

  async getStoredEmbeddingModels(): Promise<string[]> {
    const rows = this.db.prepare(
      'SELECT DISTINCT embedding_model FROM nodes_vec LIMIT 2'
    ).all() as { embedding_model: string }[];
    return rows.map(r => r.embedding_model);
  }

  // ── Dedupe walker ──────────────────────────────────────────────────────────

  async getDedupeCandidatePairs(): Promise<Array<{
    id1: string; id2: string;
    emb1: Uint8Array; emb2: Uint8Array;
    ts1: number; ts2: number;
  }>> {
    return this.db.query(`
      SELECT n1.id as id1, n2.id as id2,
             v1.embedding as emb1, v2.embedding as emb2,
             n1.created_at as ts1, n2.created_at as ts2
      FROM nodes n1
      JOIN nodes n2 ON n1.source_uri = n2.source_uri AND n1.id < n2.id
      JOIN nodes_vec v1 ON n1.id = v1.id
      JOIN nodes_vec v2 ON n2.id = v2.id
      WHERE n1.kind = 'file_chunk'
        AND n2.kind = 'file_chunk'
        AND n1.status = 'live'
        AND n2.status = 'live'
        AND v1.embedding_model = v2.embedding_model
      LIMIT 50
    `).all() as any[];
  }

  async markNodeStatusPruned(id: string, now: number): Promise<void> {
    this.db.run(`UPDATE nodes SET status='pruned', updated_at=? WHERE id=?`, now, id);
  }

  // ── Summarizer walker ──────────────────────────────────────────────────────

  async getNodesNeedingSummarization(
    charThreshold: number,
    limit: number,
  ): Promise<Array<{ id: string; content: string; source_uri: string | null }>> {
    return this.db.query<{ id: string; content: string; source_uri: string | null }, [number, number]>(`
      SELECT id, content, source_uri FROM nodes
      WHERE status = 'live'
        AND (summary IS NULL OR summary = '')
        AND length(content) > ?
      LIMIT ?
    `).all(charThreshold, limit);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    closeDb(this.db);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/store/backends/sqlite/index.ts
git commit -m "feat(phase-7): SQLite StoreBackend wrapping existing store layer"
```

---

### Task 5: Migrate existing store tests to SQLite backend test file

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Create: `src/store/backends/sqlite/index.test.ts`

- [ ] **Step 1: Create src/store/backends/sqlite/index.test.ts**

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { unlinkSync, existsSync } from 'fs';
import { createSqliteBackend } from './index.js';
import type { StoreBackend } from '../../interface.js';

const TEST_DB = '/tmp/memtree-sqlite-test.db';

let store: StoreBackend;

beforeEach(async () => { store = await createSqliteBackend(TEST_DB); });
afterEach(async () => {
  await store.close();
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(TEST_DB + ext)) unlinkSync(TEST_DB + ext);
  }
});

// ── DB setup (SQLite-specific) ──────────────────────────────────────────────

describe('SQLite setup', () => {
  test('nodes table has all required columns', async () => {
    // Access the raw db via the backend's internal — verified via a known query
    const node = await store.getNode('nonexistent');
    expect(node).toBeNull();
    // If the table didn't exist, getNode would have thrown
  });

  test('createSqliteBackend returns a StoreBackend', async () => {
    expect(typeof store.insertNode).toBe('function');
    expect(typeof store.getNode).toBe('function');
    expect(typeof store.close).toBe('function');
  });
});

// ── insertNode + getNode ───────────────────────────────────────────────────

describe('insertNode + getNode', () => {
  test('round-trip: inserted node is retrieved by id', async () => {
    await store.insertNode('01test001', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'hello world', content_hash: 'abc', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    const node = await store.getNode('01test001');
    expect(node).not.toBeNull();
    expect(node!.content).toBe('hello world');
    expect(node!.kind).toBe('note');
  });

  test('returns null for missing id', async () => {
    const node = await store.getNode('doesnotexist');
    expect(node).toBeNull();
  });
});

// ── updateNodeStatus ───────────────────────────────────────────────────────

describe('updateNodeStatus', () => {
  test('changes status of existing node', async () => {
    await store.insertNode('01status', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'test', content_hash: 'x', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.updateNodeStatus('01status', 'stale');
    const node = await store.getNode('01status');
    expect(node!.status).toBe('stale');
  });
});

// ── getNodeBySourceUri ─────────────────────────────────────────────────────

describe('getNodeBySourceUri', () => {
  test('finds live node by source_uri', async () => {
    await store.insertNode('01uri01', {
      parent_id: null, kind: 'file_chunk', source_uri: 'file:///foo.ts',
      content: 'x', content_hash: 'h1', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    const found = await store.getNodeBySourceUri('file:///foo.ts');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('01uri01');
  });

  test('returns null when no live node exists for uri', async () => {
    const found = await store.getNodeBySourceUri('file:///missing.ts');
    expect(found).toBeNull();
  });
});

// ── insertEdge + getEdgesFrom ──────────────────────────────────────────────

describe('insertEdge + getEdgesFrom', () => {
  test('inserting edge and retrieving from src', async () => {
    await store.insertNode('01edge-src', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'src', content_hash: 's', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertNode('01edge-dst', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'dst', content_hash: 'd', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertEdge({ src_id: '01edge-src', dst_id: '01edge-dst', kind: 'references' });
    const edges = await store.getEdgesFrom('01edge-src');
    expect(edges.length).toBe(1);
    expect(edges[0].kind).toBe('references');
  });

  test('duplicate insertEdge is ignored (no throw)', async () => {
    await store.insertNode('01dup-src', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 's', content_hash: 's2', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertNode('01dup-dst', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'd', content_hash: 'd2', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertEdge({ src_id: '01dup-src', dst_id: '01dup-dst', kind: 'references' });
    await expect(
      store.insertEdge({ src_id: '01dup-src', dst_id: '01dup-dst', kind: 'references' })
    ).resolves.toBeUndefined();
  });
});

// ── searchKeyword ──────────────────────────────────────────────────────────

describe('searchKeyword', () => {
  test('returns nodes matching FTS query', async () => {
    await store.insertNode('01fts01', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'bananas are yellow fruit', content_hash: 'fts1', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertNode('01fts02', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'apples are red fruit', content_hash: 'fts2', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    const results = await store.searchKeyword('bananas');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('01fts01');
  });

  test('returns empty array for empty query', async () => {
    const results = await store.searchKeyword('');
    expect(results).toEqual([]);
  });
});

// ── pruneNode ──────────────────────────────────────────────────────────────

describe('pruneNode', () => {
  test('sets status to pruned and clears content', async () => {
    await store.insertNode('01prune', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'some content', content_hash: 'p1', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.pruneNode('01prune');
    const node = await store.getNode('01prune');
    expect(node!.status).toBe('pruned');
    expect(node!.content).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/joe/github/joeblackwaslike/memtree && bun test mcp/src/store/backends/sqlite/
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/store/backends/sqlite/index.test.ts
git commit -m "test(phase-7): SQLite backend tests"
```

---

### Task 6: EdgeLite backend

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Create: `src/store/backends/edgelite/index.ts`

- [ ] **Step 1: Create src/store/backends/edgelite/index.ts**

```typescript
import path from 'path';
import { openDb, closeDb } from 'edgelite';
import type { Db } from 'edgelite';
import e from '../../../../dbschema/edgelite.js';
import type { StoreBackend, InsertNodeParams } from '../../interface.js';
import type { MemtreeNode, MemtreeEdge, NodeStatus, EdgeKind, Filters } from '../../types.js';

const NOT_IMPL = (name: string) =>
  new Error(`EdgeLite backend: ${name} is NotImplemented in Phase 7 — deferred to Phase 8`);

export async function createEdgeliteBackend(
  dbPath: string,
  schemaPath: string,
): Promise<StoreBackend> {
  const db = await openDb(dbPath, schemaPath, { autoMigrate: true });
  return new EdgeliteBackend(db);
}

class EdgeliteBackend implements StoreBackend {
  constructor(private readonly db: Db) {}

  // ── Core node CRUD ─────────────────────────────────────────────────────────

  async insertNode(id: string, p: InsertNodeParams): Promise<void> {
    await this.db.run(e.insert(e.Node, {
      id,
      kind: p.kind as any,
      status: p.status as any,
      content: p.content,
      content_hash: p.content_hash,
      mtime: p.mtime,
      created_at: Date.now(),
      updated_at: Date.now(),
      truncated: p.truncated === 1,
      original_bytes: p.original_bytes,
      ...(p.source_uri != null ? { source_uri: p.source_uri } : {}),
      metadata: JSON.parse(p.metadata),
      ...(p.summary != null ? { summary: p.summary } : {}),
      ...(p.parent_id != null ? { parent: p.parent_id } : {}),
    }));
  }

  async getNode(id: string): Promise<MemtreeNode | null> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.op(n.id, '=', id),
    })));
    const row = rows[0];
    if (!row) return null;
    return this.#toMemtreeNode(row);
  }

  async updateNodeStatus(id: string, status: NodeStatus): Promise<void> {
    await this.db.run(e.update(e.Node, n => ({
      filter: e.op(n.id, '=', id),
      set: { status: status as any, updated_at: Date.now() },
    })));
  }

  async getNodeBySourceUri(uri: string): Promise<MemtreeNode | null> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.all(
        e.op(n.source_uri, '=', uri),
        e.op(n.status, '=', 'live'),
      ),
      limit: 1,
    })));
    return rows[0] ? this.#toMemtreeNode(rows[0]) : null;
  }

  async getNodeByContentHash(hash: string): Promise<MemtreeNode | null> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.all(
        e.op(n.content_hash, '=', hash),
        e.op(n.status, '=', 'live'),
      ),
      limit: 1,
    })));
    return rows[0] ? this.#toMemtreeNode(rows[0]) : null;
  }

  async listChildren(parentId: string, status: NodeStatus = 'live'): Promise<MemtreeNode[]> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.all(
        e.op(n.parent, '=', parentId),
        e.op(n.status, '=', status),
      ),
      order_by: { expr: n.created_at, dir: 'ASC' as const },
    })));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async getOrCreateSessionNode(sessionId: string): Promise<MemtreeNode> {
    // session_id lives in metadata JSON, not a direct column — fetch all session nodes, filter in memory
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.op(n.kind, '=', 'session'),
    })));
    const existing = rows.find(r => (r.metadata ?? {}).session_id === sessionId);
    if (existing) return this.#toMemtreeNode(existing);

    const now = Date.now();
    await this.db.run(e.insert(e.Node, {
      kind: 'session' as any, content: '', status: 'live' as any,
      content_hash: '', mtime: 0, created_at: now, updated_at: now,
      truncated: false, original_bytes: 0,
      metadata: { session_id: sessionId },
    }));
    // Re-fetch the newly created node (most recent session node)
    const newRows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.op(n.kind, '=', 'session'),
      order_by: { expr: n.created_at, dir: 'DESC' as const },
      limit: 1,
    })));
    return this.#toMemtreeNode(newRows[0]);
  }

  async markStaleByFilePath(filePath: string, mtime: number): Promise<void> {
    // file_path lives in metadata JSON, not a direct column — fetch live file_chunk nodes, filter in memory
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, mtime: true, metadata: true,
      filter: e.all(
        e.op(n.kind, '=', 'file_chunk'),
        e.op(n.status, '=', 'live'),
      ),
    })));
    const toStale = rows.filter(r => {
      const fp = (r.metadata ?? {}).filePath ?? null;
      return fp === filePath && r.mtime !== mtime;
    });
    for (const row of toStale) {
      await this.db.run(e.update(e.Node, n => ({
        filter: e.op(n.id, '=', row.id),
        set: { status: 'stale' as any, updated_at: Date.now() },
      })));
    }
  }

  async countPendingNodes(): Promise<number> {
    return this.db.run<number>(e.count(e.Node, n => ({
      filter: e.op(n.status, '=', 'pending'),
    })));
  }

  async getPendingNodes(limit = 100): Promise<MemtreeNode[]> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.op(n.status, '=', 'pending'),
      order_by: { expr: n.created_at, dir: 'ASC' as const },
      limit,
    })));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async getLiveFileChunks(cutoffMs: number): Promise<MemtreeNode[]> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.all(
        e.op(n.kind, '=', 'file_chunk'),
        e.op(n.status, '=', 'live'),
        e.op(n.mtime, '!=', 0),
        e.op(n.updated_at, '<', cutoffMs),
      ),
    })));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async getStaleNodes(olderThanMs: number): Promise<MemtreeNode[]> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.all(
        e.op(n.status, '=', 'stale'),
        e.op(n.updated_at, '<', olderThanMs),
      ),
    })));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async getSupersededNodes(olderThanMs: number): Promise<MemtreeNode[]> {
    const rows = await this.db.run<any[]>(e.select(e.Node, n => ({
      id: true, kind: true, status: true, content: true, content_hash: true,
      mtime: true, created_at: true, updated_at: true, truncated: true,
      original_bytes: true, source_uri: true, metadata: true, summary: true,
      filter: e.all(
        e.op(n.status, '=', 'superseded'),
        e.op(n.updated_at, '<', olderThanMs),
      ),
    })));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async pruneNode(id: string): Promise<void> {
    await this.db.run(e.update(e.Node, n => ({
      filter: e.op(n.id, '=', id),
      set: { status: 'pruned' as any, content: '', updated_at: Date.now() },
    })));
  }

  async updateNodeSummary(id: string, summary: string): Promise<void> {
    await this.db.run(e.update(e.Node, n => ({
      filter: e.op(n.id, '=', id),
      set: { summary, updated_at: Date.now() },
    })));
  }

  // ── Edge CRUD ──────────────────────────────────────────────────────────────

  async insertEdge(edge: Omit<MemtreeEdge, 'created_at'>): Promise<void> {
    await this.db.run(
      e.insert(e.Edge, {
        src: edge.src_id,
        dst: edge.dst_id,
        kind: edge.kind as any,
        created_at: Date.now(),
      }).unlessConflict()
    );
  }

  async getNeighbors(nodeId: string, edgeKinds?: EdgeKind[]): Promise<MemtreeNode[]> {
    const rows = await this.db.run<any[]>(e.neighbors(nodeId, { edgeKinds: edgeKinds ?? [] }));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async getEdgesFrom(srcId: string): Promise<MemtreeEdge[]> {
    const rows = await this.db.run<any[]>(e.select(e.Edge, edge => ({
      src: { id: true },
      dst: { id: true },
      kind: true,
      created_at: true,
      filter: e.op(edge.src, '=', srcId),
    })));
    return rows.map(r => ({
      src_id: r.src.id,
      dst_id: r.dst.id,
      kind: r.kind,
      created_at: r.created_at,
    }));
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async searchKeyword(query: string, _filters?: Filters, limit = 20): Promise<MemtreeNode[]> {
    if (!query.trim()) return [];
    const rows = await this.db.run<any[]>(e.fts(e.Node, query, { limit }));
    return rows.map(r => this.#toMemtreeNode(r));
  }

  async searchSemantic(_vector: number[], _embeddingModel: string, _filters?: Filters, _limit?: number): Promise<MemtreeNode[]> {
    throw NOT_IMPL('searchSemantic');
  }

  // ── Complex queries — NotImplemented in Phase 7 ────────────────────────────

  async getNodesByIds(_ids: string[]): Promise<MemtreeNode[]> { throw NOT_IMPL('getNodesByIds'); }
  async getRecentNodes(_since?: number, _limit?: number, _filters?: Filters): Promise<MemtreeNode[]> { throw NOT_IMPL('getRecentNodes'); }
  async getPathToRoot(_nodeId: string): Promise<MemtreeNode[]> { throw NOT_IMPL('getPathToRoot'); }
  async getNeighborsDeep(_nodeId: string, _depth?: number, _edgeKinds?: EdgeKind[], _filters?: Filters): Promise<MemtreeNode[]> { throw NOT_IMPL('getNeighborsDeep'); }
  async expandGraph(_seedIds: string[], _maxDepth: number): Promise<Map<string, number>> { throw NOT_IMPL('expandGraph'); }
  async getFtsRanks(_query: string, _ids: string[]): Promise<Map<string, number>> { throw NOT_IMPL('getFtsRanks'); }

  // ── Vector / embedding — NotImplemented in Phase 7 ────────────────────────

  async getPendingEmbeddingNodes(_batchSize: number): Promise<Array<{ id: string; content: string }>> { throw NOT_IMPL('getPendingEmbeddingNodes'); }
  async batchUpsertNodeVec(_rows: Array<{ id: string; embedding: Buffer; model: string; dim: number; embeddedAt: number }>): Promise<void> { throw NOT_IMPL('batchUpsertNodeVec'); }
  async getStoredEmbeddingModels(): Promise<string[]> { throw NOT_IMPL('getStoredEmbeddingModels'); }

  // ── Dedupe walker — NotImplemented in Phase 7 ─────────────────────────────

  async getDedupeCandidatePairs(): Promise<any[]> { throw NOT_IMPL('getDedupeCandidatePairs'); }
  async markNodeStatusPruned(_id: string, _now: number): Promise<void> { throw NOT_IMPL('markNodeStatusPruned'); }

  // ── Summarizer walker — NotImplemented in Phase 7 ─────────────────────────

  async getNodesNeedingSummarization(_charThreshold: number, _limit: number): Promise<any[]> { throw NOT_IMPL('getNodesNeedingSummarization'); }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await closeDb(this.db);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #toMemtreeNode(row: any): MemtreeNode {
    return {
      id: row.id,
      parent_id: row.parent?.id ?? null,
      kind: row.kind,
      source_uri: row.source_uri ?? null,
      content: row.content ?? '',
      content_hash: row.content_hash ?? '',
      status: row.status,
      mtime: row.mtime ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      truncated: row.truncated ? 1 : 0,
      original_bytes: row.original_bytes ?? 0,
      metadata: typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata ?? {}),
      summary: row.summary ?? null,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/store/backends/edgelite/index.ts
git commit -m "feat(phase-7): EdgeLite StoreBackend (CRUD + searchKeyword)"
```

---

### Task 7: EdgeLite backend tests

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Create: `src/store/backends/edgelite/index.test.ts`

- [ ] **Step 1: Create src/store/backends/edgelite/index.test.ts**

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, existsSync } from 'fs';
import path from 'path';
import { createEdgeliteBackend } from './index.js';
import type { StoreBackend } from '../../interface.js';

const TEST_DB = '/tmp/memtree-edgelite-test';
const SCHEMA_PATH = path.join(import.meta.dir, '../../../../dbschema/schema.esdl');

let store: StoreBackend;

beforeEach(async () => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
  store = await createEdgeliteBackend(TEST_DB, SCHEMA_PATH);
});
afterEach(async () => {
  await store.close();
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('EdgeLite backend setup', () => {
  test('createEdgeliteBackend resolves to a StoreBackend', () => {
    expect(typeof store.insertNode).toBe('function');
    expect(typeof store.getNode).toBe('function');
    expect(typeof store.close).toBe('function');
  });
});

describe('insertNode + getNode', () => {
  test('round-trip', async () => {
    await store.insertNode('01eltest01', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'edgelite test', content_hash: 'abc', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    const node = await store.getNode('01eltest01');
    expect(node).not.toBeNull();
    expect(node!.content).toBe('edgelite test');
  });
});

describe('updateNodeStatus', () => {
  test('status change persists', async () => {
    await store.insertNode('01elstatus', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'x', content_hash: 'y', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.updateNodeStatus('01elstatus', 'stale');
    const node = await store.getNode('01elstatus');
    expect(node!.status).toBe('stale');
  });
});

describe('insertEdge + getEdgesFrom', () => {
  test('round-trip', async () => {
    await store.insertNode('01el-src', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'src', content_hash: 's', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertNode('01el-dst', {
      parent_id: null, kind: 'note', source_uri: null,
      content: 'dst', content_hash: 'd', status: 'live',
      mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
    });
    await store.insertEdge({ src_id: '01el-src', dst_id: '01el-dst', kind: 'references' });
    const edges = await store.getEdgesFrom('01el-src');
    expect(edges.length).toBe(1);
    expect(edges[0].kind).toBe('references');
  });
});

describe('NotImplemented methods', () => {
  test('searchSemantic throws NotImplemented', async () => {
    await expect(store.searchSemantic([1, 2, 3], 'test-model')).rejects.toThrow('NotImplemented');
  });
  test('getNodesByIds throws NotImplemented', async () => {
    await expect(store.getNodesByIds(['x'])).rejects.toThrow('NotImplemented');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/joe/github/joeblackwaslike/memtree && bun test mcp/src/store/backends/edgelite/
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/store/backends/edgelite/index.test.ts
git commit -m "test(phase-7): EdgeLite backend tests"
```

---

### Task 8: Store factory + contract tests

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Create: `src/store/index.ts`
- Create: `src/store/__tests__/contract.test.ts`

- [ ] **Step 1: Create src/store/index.ts**

```typescript
import path from 'path';
import { createSqliteBackend } from './backends/sqlite/index.js';
import { createEdgeliteBackend } from './backends/edgelite/index.js';
import type { BackendConfig } from './types.js';
import type { StoreBackend } from './interface.js';

export type { StoreBackend } from './interface.js';
export type { InsertNodeParams } from './interface.js';

export async function createBackend(config: BackendConfig, dbPath: string): Promise<StoreBackend> {
  if (config.kind === 'edgelite') {
    const schemaPath = config.schemaPath
      ?? path.join(process.cwd(), 'dbschema', 'schema.esdl');
    return createEdgeliteBackend(dbPath, schemaPath);
  }
  return createSqliteBackend(dbPath);
}
```

- [ ] **Step 2: Create src/store/__tests__/contract.test.ts**

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { createSqliteBackend } from '../backends/sqlite/index.js';
import { createEdgeliteBackend } from '../backends/edgelite/index.js';
import type { StoreBackend } from '../interface.js';

const SCHEMA_PATH = path.join(import.meta.dir, '../../../dbschema/schema.esdl');

const fixtures = [
  {
    name: 'sqlite',
    dbPath: '/tmp/mt-contract-sqlite.db',
    create: async () => createSqliteBackend('/tmp/mt-contract-sqlite.db'),
    cleanup: () => {
      for (const ext of ['', '-wal', '-shm']) {
        if (existsSync('/tmp/mt-contract-sqlite.db' + ext))
          unlinkSync('/tmp/mt-contract-sqlite.db' + ext);
      }
    },
  },
  {
    name: 'edgelite',
    dbPath: '/tmp/mt-contract-edgelite',
    create: async () => createEdgeliteBackend('/tmp/mt-contract-edgelite', SCHEMA_PATH),
    cleanup: () => {
      if (existsSync('/tmp/mt-contract-edgelite'))
        rmSync('/tmp/mt-contract-edgelite', { recursive: true });
    },
  },
];

for (const { name, create, cleanup } of fixtures) {
  describe(`StoreBackend contract [${name}]`, () => {
    let store: StoreBackend;

    beforeEach(async () => {
      cleanup();
      store = await create();
    });
    afterEach(async () => {
      await store.close();
      cleanup();
    });

    test('insertNode + getNode round-trip', async () => {
      await store.insertNode('ct-001', {
        parent_id: null, kind: 'note', source_uri: null,
        content: 'contract test', content_hash: 'ct1', status: 'live',
        mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
      });
      const node = await store.getNode('ct-001');
      expect(node).not.toBeNull();
      expect(node!.content).toBe('contract test');
      expect(node!.status).toBe('live');
    });

    test('getNode returns null for missing id', async () => {
      expect(await store.getNode('missing')).toBeNull();
    });

    test('updateNodeStatus persists', async () => {
      await store.insertNode('ct-002', {
        parent_id: null, kind: 'note', source_uri: null,
        content: 'x', content_hash: 'c2', status: 'live',
        mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
      });
      await store.updateNodeStatus('ct-002', 'stale');
      const n = await store.getNode('ct-002');
      expect(n!.status).toBe('stale');
    });

    test('getNodeBySourceUri finds live node', async () => {
      await store.insertNode('ct-003', {
        parent_id: null, kind: 'file_chunk', source_uri: 'file:///contract.ts',
        content: 'c', content_hash: 'c3', status: 'live',
        mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
      });
      const found = await store.getNodeBySourceUri('file:///contract.ts');
      expect(found!.id).toBe('ct-003');
    });

    test('pruneNode clears content + sets status', async () => {
      await store.insertNode('ct-004', {
        parent_id: null, kind: 'note', source_uri: null,
        content: 'tbd', content_hash: 'c4', status: 'live',
        mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
      });
      await store.pruneNode('ct-004');
      const n = await store.getNode('ct-004');
      expect(n!.status).toBe('pruned');
      expect(n!.content).toBe('');
    });

    test('insertEdge + getEdgesFrom', async () => {
      await store.insertNode('ct-src', {
        parent_id: null, kind: 'note', source_uri: null,
        content: 's', content_hash: 'cs', status: 'live',
        mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
      });
      await store.insertNode('ct-dst', {
        parent_id: null, kind: 'note', source_uri: null,
        content: 'd', content_hash: 'cd', status: 'live',
        mtime: 0, truncated: 0, original_bytes: 0, metadata: '{}',
      });
      await store.insertEdge({ src_id: 'ct-src', dst_id: 'ct-dst', kind: 'references' });
      const edges = await store.getEdgesFrom('ct-src');
      expect(edges.length).toBe(1);
      expect(edges[0].kind).toBe('references');
    });

    test('searchSemantic throws NotImplemented on edgelite', async () => {
      if (name !== 'edgelite') return;
      await expect(store.searchSemantic([1, 2, 3], 'model')).rejects.toThrow('NotImplemented');
    });
  });
}
```

- [ ] **Step 3: Run contract tests**

```bash
cd /Users/joe/github/joeblackwaslike/memtree && bun test mcp/src/store/__tests__/
```

Expected: all contract tests pass for both backends.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts src/store/__tests__/contract.test.ts
git commit -m "feat(phase-7): createBackend factory + contract tests (sqlite + edgelite)"
```

---

### Task 9: Update server.ts

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:**
- Modify: `src/server.ts`

The key change: replace `openDb(dbPath)` with `await createBackend(...)`. Pass `store: StoreBackend` to all tools and `WalkerCoordinator`.

- [ ] **Step 1: Replace db import + creation in server.ts**

At the top of `server.ts`, replace:

```typescript
import { openDb, closeDb } from './store/db.js';
```

with:

```typescript
import { createBackend } from './store/index.js';
import type { StoreBackend } from './store/index.js';
```

- [ ] **Step 2: Replace openDb call**

Find the line `const db = openDb(dbPath);` and replace with:

```typescript
const store = await createBackend(config.backend ?? { kind: 'sqlite' }, dbPath);
```

- [ ] **Step 3: Replace closeDb in shutdown handler**

Find `closeDb(db)` and replace with `await store.close()`.

- [ ] **Step 4: Update all `db` references in server.ts to `store`**

All call sites in server.ts that pass `db` to tools/walkers change from `db` to `store`. For example:

```typescript
// before
const result = getNeighborsDeep(db, node_id, cap, edge_kinds as any, filters);
// after
const result = await getNeighborsDeep(store, node_id, cap, edge_kinds as any, filters);
```

All `processIngest(db, ...)` calls become `processIngest(store, ...)`.
All `WalkerCoordinator` method calls: `coordinator.startupSweep(db, config)` → `coordinator.startupSweep(store, config)`, etc.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat(phase-7): server.ts uses createBackend + StoreBackend"
```

---

### Task 10: Update all tool files

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

For each tool file: remove `import type { Database } from 'bun:sqlite'`, add `import type { StoreBackend } from '../store/index.js'`, change function param from `db: Database` to `store: StoreBackend`, add `await` to all store calls, mark functions `async`.

**Files:** `src/tools/search.ts`, `src/tools/compose.ts`, `src/tools/neighbors.ts`, `src/tools/path-to-root.ts`, `src/tools/recent.ts`, `src/tools/read.ts`, `src/tools/note.ts`, `src/tools/monitor.ts`, `src/tools/bash.ts`, `src/tools/grep.ts`, `src/tools/browse.ts`

- [ ] **Step 1: Update src/tools/search.ts**

Replace the entire file:

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { StoreBackend } from '../store/index.js';
import type { MemtreeNode, Filters, EmbeddingProvider, MemtreeConfig } from '../store/types.js';

export interface SearchResult {
  nodes: MemtreeNode[];
}

export async function searchKeyword(
  store: StoreBackend,
  query: string,
  limit = 20,
  filters: Filters = {}
): Promise<SearchResult> {
  const nodes = await store.searchKeyword(query, filters, limit);
  return { nodes };
}

export async function searchSemantic(
  store: StoreBackend,
  config: MemtreeConfig,
  provider: EmbeddingProvider | null,
  query: string,
  limit = 20,
  filters: Filters = {}
): Promise<SearchResult> {
  if (!provider) {
    throw new McpError(ErrorCode.InvalidParams, 'semantic search requires an embedding provider');
  }
  const [queryVec] = await provider.embed([query]);
  const nodes = await store.searchSemantic(queryVec, provider.model, filters, limit);
  return { nodes };
}

export async function searchHybrid(
  store: StoreBackend,
  config: MemtreeConfig,
  provider: EmbeddingProvider | null,
  query: string,
  limit = 20,
  filters: Filters = {}
): Promise<SearchResult> {
  if (!provider) {
    throw new McpError(ErrorCode.InvalidParams, 'hybrid search requires an embedding provider');
  }

  const keywordResults = (await searchKeyword(store, query, limit * 2, filters)).nodes;
  const semanticResults = (await searchSemantic(store, config, provider, query, limit * 2, filters)).nodes;

  const RRF_K = 60;
  const scores = new Map<string, number>();
  keywordResults.forEach((n, i) => scores.set(n.id, (scores.get(n.id) ?? 0) + 1 / (RRF_K + i + 1)));
  semanticResults.forEach((n, i) => scores.set(n.id, (scores.get(n.id) ?? 0) + 1 / (RRF_K + i + 1)));

  const allNodes = new Map<string, MemtreeNode>();
  for (const n of [...keywordResults, ...semanticResults]) allNodes.set(n.id, n);

  const sorted = [...allNodes.values()].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
  );
  return { nodes: sorted.slice(0, limit) };
}
```

- [ ] **Step 2: Update src/tools/compose.ts**

Replace the top of the file (imports + `expandGraph` + `getFtsRanks` functions) so that those functions use `store: StoreBackend` instead of `db: Database`. The `expandGraph` and `getFtsRanks` private helpers are removed and replaced by delegating to the store.

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeNode, ComposeManifest } from '../store/types.js';

export interface ComposeParams {
  node_ids: string[];
  budget_tokens: number;
  format?: 'raw' | 'outline' | 'mixed';
  query?: string;
  depth?: number;
}

export interface ComposeResult {
  content: string;
  manifest: ComposeManifest;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function scoreNode(
  node: MemtreeNode,
  graphDistance: number,
  queryRank: number,
  hasQuery: boolean
): number {
  const wDist = 0.7;
  const wRecency = 0.3;
  const wQuery = hasQuery ? 0.1 : 0.0;
  const ageHours = (Date.now() - node.updated_at) / (1000 * 60 * 60);
  const recencyDecay = Math.exp(-ageHours / 24);
  return wDist * (1 / (1 + graphDistance)) + wRecency * recencyDecay + wQuery * queryRank;
}

function formatOutline(node: MemtreeNode): string {
  const prefix = `[${node.id}] ${node.kind}: `;
  const suffix = '…';
  const maxPreview = Math.max(0, Math.min(120, node.content.length - prefix.length - suffix.length - 1));
  const preview = node.content.slice(0, maxPreview).replace(/\n/g, ' ');
  return `${prefix}${preview}${suffix}`;
}

export async function memtreeCompose(
  store: StoreBackend,
  params: ComposeParams
): Promise<ComposeResult> {
  const { node_ids, budget_tokens, format = 'raw', query } = params;
  const depth = Math.min(params.depth ?? 2, 2);

  const distanceMap = await store.expandGraph(node_ids, depth);
  if (distanceMap.size === 0) {
    return { content: '', manifest: { included: [], dropped: [], truncated: [] } };
  }

  const allIds = [...distanceMap.keys()];
  const candidates = await store.getNodesByIds(allIds);

  const ftsRanks = query
    ? await store.getFtsRanks(query, allIds)
    : new Map<string, number>();

  const scored = candidates.map(node => ({
    node,
    score: scoreNode(
      node,
      distanceMap.get(node.id) ?? 0,
      ftsRanks.get(node.id) ?? 0,
      !!query,
    ),
  }));
  scored.sort((a, b) => b.score - a.score);

  let budget = budget_tokens;
  const included: string[] = [];
  const dropped: ComposeManifest['dropped'] = [];
  const truncated: string[] = [];
  const summary_substituted: string[] = [];
  const parts: string[] = [];

  for (const { node } of scored) {
    if (node.status === 'superseded') {
      dropped.push({ id: node.id, reason: 'superseded' });
      continue;
    }
    if (node.status === 'pruned') {
      dropped.push({ id: node.id, reason: 'pruned' });
      continue;
    }

    let text = format === 'outline' ? formatOutline(node) : node.content;
    const usesSummary = format === 'mixed' && node.summary && node.summary.length < node.content.length;
    if (usesSummary) {
      text = node.summary!;
      summary_substituted.push(node.id);
    }

    const tokens = estimateTokens(text);
    if (tokens > budget) {
      if (budget < 50) {
        dropped.push({ id: node.id, reason: 'over_budget' });
        continue;
      }
      const chars = budget * 4;
      text = text.slice(0, chars);
      truncated.push(node.id);
    }
    budget -= estimateTokens(text);
    included.push(node.id);
    parts.push(text);
  }

  return {
    content: parts.join('\n\n'),
    manifest: { included, dropped, truncated, ...(summary_substituted.length ? { summary_substituted } : {}) },
  };
}
```

- [ ] **Step 3: Update src/tools/neighbors.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeNode, EdgeKind, Filters } from '../store/types.js';

export async function getNeighborsDeep(
  store: StoreBackend,
  nodeId: string,
  depth = 1,
  edgeKinds?: EdgeKind[],
  filters: Filters = {}
): Promise<MemtreeNode[]> {
  return store.getNeighborsDeep(nodeId, depth, edgeKinds, filters);
}
```

- [ ] **Step 4: Update src/tools/path-to-root.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeNode } from '../store/types.js';

export async function getPathToRoot(store: StoreBackend, nodeId: string): Promise<MemtreeNode[]> {
  return store.getPathToRoot(nodeId);
}
```

- [ ] **Step 5: Update src/tools/recent.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeNode, Filters, NodeKind } from '../store/types.js';

const CONTENT_KINDS: NodeKind[] = [
  'file_chunk', 'tool_output', 'summary', 'note', 'observation', 'web_chunk',
];

export async function getRecent(
  store: StoreBackend,
  since?: number,
  limit = 50,
  filters: Filters = {}
): Promise<MemtreeNode[]> {
  return store.getRecentNodes(since, limit, {
    kind: CONTENT_KINDS,
    ...filters,
  });
}
```

- [ ] **Step 6: Update src/tools/read.ts, note.ts, monitor.ts, bash.ts, grep.ts, browse.ts**

For each of these six files apply the same mechanical transformation:

1. Remove `import type { Database } from 'bun:sqlite';`
2. Add `import type { StoreBackend } from '../store/index.js';`
3. Change every function signature `db: Database` → `store: StoreBackend`
4. Change every `insertNode(db, ...)` → `await store.insertNode(...)`
5. Change every `insertEdge(db, ...)` → `await store.insertEdge(...)`
6. Change every `getNodeBySourceUri(db, ...)` → `await store.getNodeBySourceUri(...)`
7. Change every `updateNodeStatus(db, ...)` → `await store.updateNodeStatus(...)`
8. Mark the top-level exported function `async` (it likely already is, but verify)
9. Remove unused imports from `../store/nodes.js` / `../store/edges.js`

- [ ] **Step 7: Run tests**

```bash
cd /Users/joe/github/joeblackwaslike/memtree && bun test mcp/src/
```

Expected: all existing tests continue to pass.

- [ ] **Step 8: Commit**

```bash
git add src/tools/
git commit -m "feat(phase-7): tools migrated to StoreBackend"
```

---

### Task 11: Update walkers + ingest.ts

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/mcp/`

**Files:** `src/walkers/coordinator.ts`, `src/walkers/pruner.ts`, `src/walkers/dedupe.ts`, `src/walkers/staleness.ts`, `src/walkers/embedding.ts`, `src/walkers/summarizer.ts`, `src/ingest.ts`

- [ ] **Step 1: Update src/walkers/coordinator.ts**

Change all `db: Database` params to `store: StoreBackend`. Add `import type { StoreBackend } from '../store/index.js'`. Remove bun:sqlite import. All `fn(db, ...)` calls become `fn(store, ...)`.

- [ ] **Step 2: Update src/walkers/pruner.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeConfig } from '../store/types.js';

export async function runPrunerWalker(store: StoreBackend, config: MemtreeConfig): Promise<void> {
  const now = Date.now();
  const staleThreshold = now - config.retention.staleHours * 60 * 60 * 1000;
  const supersededThreshold = now - config.retention.supersededDays * 24 * 60 * 60 * 1000;

  for (const node of await store.getStaleNodes(staleThreshold)) {
    await store.pruneNode(node.id);
  }
  for (const node of await store.getSupersededNodes(supersededThreshold)) {
    await store.pruneNode(node.id);
  }
}
```

Note: the SQLite transaction wrapper is removed; atomicity is not required for prune operations in Phase 7.

- [ ] **Step 3: Update src/walkers/dedupe.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeConfig } from '../store/types.js';

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function runDedupeWalker(store: StoreBackend, _config: MemtreeConfig): Promise<void> {
  const pairs = await store.getDedupeCandidatePairs();
  if (pairs.length === 0) return;

  const now = Date.now();

  for (const pair of pairs) {
    const a = new Float32Array(pair.emb1.buffer, pair.emb1.byteOffset, pair.emb1.byteLength / 4);
    const b = new Float32Array(pair.emb2.buffer, pair.emb2.byteOffset, pair.emb2.byteLength / 4);
    const sim = cosineSimilarity(a, b);

    if (sim > 0.95) {
      const keepId = pair.ts1 >= pair.ts2 ? pair.id1 : pair.id2;
      const pruneId = pair.ts1 >= pair.ts2 ? pair.id2 : pair.id1;
      await store.markNodeStatusPruned(pruneId, now);
      await store.insertEdge({ src_id: keepId, dst_id: pruneId, kind: 'supersedes' });
    }
  }
}
```

- [ ] **Step 4: Update src/walkers/staleness.ts**

Replace the entire file:

```typescript
import { statSync } from 'fs';
import type { StoreBackend } from '../store/index.js';
import type { MemtreeConfig } from '../store/types.js';

export async function runStalenessWalker(store: StoreBackend, _config: MemtreeConfig): Promise<void> {
  const checkBefore = Date.now() - 5000;
  const chunks = await store.getLiveFileChunks(checkBefore);

  for (const node of chunks) {
    const meta = JSON.parse(node.metadata) as { filePath?: string };
    const filePath = meta.filePath ?? node.source_uri?.replace(/^file:\/\//, '').split('#')[0];
    if (!filePath) continue;

    try {
      const stat = statSync(filePath);
      if (Math.round(stat.mtimeMs) !== node.mtime) {
        await store.updateNodeStatus(node.id, 'stale');
      }
    } catch {
      await store.updateNodeStatus(node.id, 'stale');
    }
  }
}
```

- [ ] **Step 5: Update src/walkers/embedding.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeConfig, EmbeddingProvider } from '../store/types.js';

let inFlight = false;

export function runEmbeddingWalker(
  store: StoreBackend,
  config: MemtreeConfig,
  provider: EmbeddingProvider | null
): void {
  if (!provider) return;
  if (inFlight) return;

  const batchSize = config.walkers.embeddingBatchSize;

  store.getPendingEmbeddingNodes(batchSize).then(rows => {
    if (rows.length === 0) return;
    inFlight = true;
    const texts = rows.map(r => r.content);

    return provider.embed(texts).then(vectors => {
      const now = Date.now();
      const upsertRows = rows.map((row, i) => ({
        id: row.id,
        embedding: Buffer.from(new Float32Array(vectors[i]).buffer),
        model: provider.model,
        dim: vectors[i].length,
        embeddedAt: now,
      }));
      return store.batchUpsertNodeVec(upsertRows);
    });
  }).catch((e: unknown) => {
    process.stderr.write(`memtree embedding error: ${e}\n`);
  }).finally(() => {
    inFlight = false;
  });
}
```

- [ ] **Step 6: Update src/walkers/summarizer.ts**

Replace the entire file:

```typescript
import type { StoreBackend } from '../store/index.js';
import type { MemtreeConfig, SummarizerProvider } from '../store/types.js';

const CHAR_THRESHOLD_MULTIPLIER = 20;

let inFlight = false;

export function runSummarizerWalker(
  store: StoreBackend,
  config: MemtreeConfig,
  provider: SummarizerProvider | null
): void {
  if (!provider) return;
  if (inFlight) return;

  const charThreshold = Math.max(
    500,
    config.walkers.summarizerSubtreeThreshold * CHAR_THRESHOLD_MULTIPLIER
  );
  const batchSize = 10;

  store.getNodesNeedingSummarization(charThreshold, batchSize).then(rows => {
    if (rows.length === 0) return;
    inFlight = true;
    let pending = rows.length;

    for (const row of rows) {
      provider.summarize(row.content, row.source_uri ?? undefined).then(summary => {
        return store.updateNodeSummary(row.id, summary);
      }).catch((e: unknown) => {
        process.stderr.write(`memtree summarizer error: ${e}\n`);
      }).finally(() => {
        pending--;
        if (pending === 0) inFlight = false;
      });
    }
  }).catch((e: unknown) => {
    process.stderr.write(`memtree summarizer error: ${e}\n`);
  });
}
```

- [ ] **Step 7: Update src/ingest.ts**

Change all `db: Database` parameters to `store: StoreBackend`. Remove `import type { Database } from 'bun:sqlite'`. Add `import type { StoreBackend } from './store/index.js'`. All direct `insertNode(db, ...)` calls become `await store.insertNode(...)`. The `ring` buffer type changes from `{ db: Database; ... }` to `{ store: StoreBackend; ... }`. The `processPayloadSync` and related functions become `async`. The exported `processIngest` becomes async.

- [ ] **Step 8: Run full test suite**

```bash
cd /Users/joe/github/joeblackwaslike/memtree && bun test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/walkers/ src/ingest.ts
git commit -m "feat(phase-7): walkers + ingest migrated to StoreBackend"
```

---

### Task 12: Final verification

**Working directory:** `/Users/joe/github/joeblackwaslike/memtree/`

- [ ] **Step 1: Run the full test suite**

```bash
bun test
```

Expected: all tests pass, zero failures.

- [ ] **Step 2: Verify no bun:sqlite imports outside SQLite backend**

```bash
grep -r "bun:sqlite" mcp/src/ --include="*.ts" | grep -v "backends/sqlite/"
```

Expected: no matches.

- [ ] **Step 3: Verify no raw Database imports in tools or walkers**

```bash
grep -r "Database" mcp/src/tools/ mcp/src/walkers/ mcp/src/ingest.ts mcp/src/server.ts
```

Expected: no matches.

- [ ] **Step 4: Smoke-test EdgeLite backend end-to-end**

```bash
MEMTREE_BACKEND=edgelite bun test mcp/src/store/__tests__/
```

Expected: contract tests pass for EdgeLite backend.

- [ ] **Step 5: Commit final fixes (if any)**

```bash
git add -p
git commit -m "fix(phase-7): final cleanup after full test run"
```

---

### Phase 7 Deliverable Verification

- [ ] `bun test` — all tests pass
- [ ] `grep -r "bun:sqlite" mcp/src/ --include="*.ts" | grep -v "backends/sqlite/"` — no matches
- [ ] `MEMTREE_BACKEND=edgelite bun test mcp/src/store/` — contract tests pass for EdgeLite
- [ ] `dbschema/schema.esdl` and `dbschema/migrations/` committed
- [ ] Phase 8 plan has the `searchSemantic` deferred note ✓ (already done)
