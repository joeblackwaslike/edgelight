# EdgeLite Phase 1 — PGlite Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `openDb()` and `closeDb()` — the library's single entry point. Opens a PGlite data directory, loads the `pgvector` and `pg_trgm` extensions, creates the `_edgelite_migrations` tracking table, and wires up the `autoMigrate` option (which does nothing until Phase 6). Returns a `Db` handle that queues sequential execution.

**Architecture:** `src/db.ts` owns the public `openDb`/`closeDb` API. `src/types.ts` holds the `Db` interface and `DbOptions`. `src/errors.ts` defines all error classes. The internal `DbImpl` class wraps the raw PGlite instance and enforces the sequential-execution invariant via a simple in-flight boolean guard.

**Tech Stack:** pnpm, TypeScript, `@electric-sql/pglite`, Vitest

---

## Files

- Create: `src/errors.ts` — all EdgeLite error classes
- Create: `src/types.ts` — `Db` interface, `DbOptions`, internal types
- Create: `src/db.ts` — `openDb()`, `closeDb()`, `DbImpl`
- Create: `src/__tests__/db.test.ts` — integration tests against a real PGlite instance

---

### Task 1: Define error classes

**Files:**
- Create: `src/errors.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  EdgeLiteParseError,
  EdgeLiteCompileError,
  EdgeLiteRuntimeError,
  EdgeLiteSchemaError,
  EdgeLiteConcurrencyError,
} from '../errors.js';

describe('error classes', () => {
  it('EdgeLiteParseError has correct name and message', () => {
    const e = new EdgeLiteParseError('bad token at line 3');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('EdgeLiteParseError');
    expect(e.message).toBe('bad token at line 3');
  });

  it('EdgeLiteSchemaError has correct name', () => {
    const e = new EdgeLiteSchemaError('unapplied migrations: 00002-add-col.sql');
    expect(e.name).toBe('EdgeLiteSchemaError');
  });

  it('EdgeLiteConcurrencyError has correct name', () => {
    const e = new EdgeLiteConcurrencyError('db.run() called while another query is in flight');
    expect(e.name).toBe('EdgeLiteConcurrencyError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/__tests__/errors.test.ts
```

Expected: FAIL — "Cannot find module '../errors.js'"

- [ ] **Step 3: Implement error classes**

```typescript
// src/errors.ts

export class EdgeLiteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteParseError';
  }
}

export class EdgeLiteCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteCompileError';
  }
}

export class EdgeLiteRuntimeError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EdgeLiteRuntimeError';
    this.cause = cause;
  }
}

export class EdgeLiteSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteSchemaError';
  }
}

export class EdgeLiteConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteConcurrencyError';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/__tests__/errors.test.ts
```

Expected: 3 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts src/__tests__/errors.test.ts
git commit -m "feat(phase-1): add EdgeLite error classes"
```

---

### Task 2: Define Db types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write src/types.ts**

```typescript
// src/types.ts
import type { PGlite } from '@electric-sql/pglite';

export interface DbOptions {
  autoMigrate?: boolean;
}

/**
 * Public Db handle. All queries go through db.run().
 * Sequential execution is enforced — concurrent calls throw EdgeLiteConcurrencyError.
 */
export interface Db {
  /** Execute a query builder expression. Returns typed result objects. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<T>(query: any): Promise<T>;
  /** Graceful shutdown — flushes PGlite and releases the data directory lock. */
  close(): Promise<void>;
  /** Absolute path to the PGlite data directory. */
  readonly path: string;
}

/** Internal — not exported from package index. */
export interface InternalDb extends Db {
  readonly pglite: PGlite;
  readonly schemaPath: string;
  readonly options: Required<DbOptions>;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

---

### Task 3: Implement openDb — creates data directory and loads extensions

**Files:**
- Create: `src/db.ts`
- Create: `src/__tests__/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/db.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { openDb, closeDb } from '../db.js';
import { rmSync, existsSync } from 'node:fs';

const TEST_DB = './test-db-phase1';

afterEach(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('openDb', () => {
  it('creates the data directory if it does not exist', async () => {
    const db = await openDb(TEST_DB, './schema.esdl');
    expect(existsSync(TEST_DB)).toBe(true);
    await closeDb(db);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/__tests__/db.test.ts
```

Expected: FAIL — "Cannot find module '../db.js'"

- [ ] **Step 3: Implement openDb skeleton**

```typescript
// src/db.ts
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { mkdirSync } from 'node:fs';
import type { Db, DbOptions, InternalDb } from './types.js';
import { EdgeLiteConcurrencyError, EdgeLiteRuntimeError } from './errors.js';

export async function openDb(
  dbPath: string,
  schemaPath: string,
  opts: DbOptions = {},
): Promise<Db> {
  mkdirSync(dbPath, { recursive: true });

  const pglite = await PGlite.create(dbPath, {
    extensions: { vector },
  });

  await ensureMigrationsTable(pglite);

  const db: InternalDb = new DbImpl(pglite, dbPath, schemaPath, {
    autoMigrate: opts.autoMigrate ?? false,
  });

  return db;
}

export async function closeDb(db: Db): Promise<void> {
  await (db as InternalDb).pglite.close();
}

async function ensureMigrationsTable(pglite: PGlite): Promise<void> {
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS _edgelite_migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

class DbImpl implements InternalDb {
  readonly pglite: PGlite;
  readonly path: string;
  readonly schemaPath: string;
  readonly options: Required<DbOptions>;
  private inFlight = false;

  constructor(
    pglite: PGlite,
    path: string,
    schemaPath: string,
    options: Required<DbOptions>,
  ) {
    this.pglite = pglite;
    this.path = path;
    this.schemaPath = schemaPath;
    this.options = options;
  }

  async run<T>(query: unknown): Promise<T> {
    if (this.inFlight) {
      throw new EdgeLiteConcurrencyError(
        'db.run() called while another query is in flight',
      );
    }
    this.inFlight = true;
    try {
      // Runtime SQL compilation wired in Phase 5
      throw new Error('Not implemented — wire runtime in Phase 5');
    } catch (err) {
      if (err instanceof EdgeLiteConcurrencyError) throw err;
      throw new EdgeLiteRuntimeError(String(err), err);
    } finally {
      this.inFlight = false;
    }
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/__tests__/db.test.ts
```

Expected: `creates the data directory if it does not exist` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/__tests__/db.test.ts src/types.ts
git commit -m "feat(phase-1): openDb creates PGlite data directory"
```

---

### Task 4: Verify pgvector extension loads

**Files:**
- Modify: `src/__tests__/db.test.ts`

- [ ] **Step 1: Add extension test**

Append to `src/__tests__/db.test.ts`:

```typescript
  it('loads pgvector extension so vector columns can be created', async () => {
    const db = await openDb(TEST_DB, './schema.esdl') as InternalDb;
    const result = await db.pglite.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`
    );
    expect(result.rows[0]?.extname).toBe('vector');
    await closeDb(db);
  });
```

Also add the import at the top:
```typescript
import type { InternalDb } from '../types.js';
```

- [ ] **Step 2: Run tests**

```bash
pnpm test src/__tests__/db.test.ts
```

Expected: 2 pass, 0 fail.

---

### Task 5: Verify _edgelite_migrations table is created on first open

**Files:**
- Modify: `src/__tests__/db.test.ts`

- [ ] **Step 1: Add migrations table test**

```typescript
  it('creates _edgelite_migrations table on first open', async () => {
    const db = await openDb(TEST_DB, './schema.esdl') as InternalDb;
    const result = await db.pglite.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = '_edgelite_migrations'`
    );
    expect(result.rows[0]?.tablename).toBe('_edgelite_migrations');
    await closeDb(db);
  });

  it('does not error if _edgelite_migrations already exists (idempotent open)', async () => {
    const db1 = await openDb(TEST_DB, './schema.esdl');
    await closeDb(db1);
    // Second open should not throw
    const db2 = await openDb(TEST_DB, './schema.esdl');
    await closeDb(db2);
  });
```

- [ ] **Step 2: Run tests**

```bash
pnpm test src/__tests__/db.test.ts
```

Expected: 4 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/db.test.ts
git commit -m "test(phase-1): verify pgvector extension and migrations table on openDb"
```

---

### Task 6: Verify concurrent run() throws EdgeLiteConcurrencyError

**Files:**
- Modify: `src/__tests__/db.test.ts`

- [ ] **Step 1: Add concurrency test**

```typescript
describe('db.run concurrency guard', () => {
  it('throws EdgeLiteConcurrencyError when called while in flight', async () => {
    const db = await openDb(TEST_DB, './schema.esdl') as InternalDb;
    // Manually set inFlight to simulate an in-progress query
    (db as any).inFlight = true;
    await expect(db.run({})).rejects.toThrow('db.run() called while another query is in flight');
    (db as any).inFlight = false;
    await closeDb(db);
  });
});
```

Also add import:
```typescript
import { EdgeLiteConcurrencyError } from '../errors.js';
```

- [ ] **Step 2: Run tests**

```bash
pnpm test src/__tests__/db.test.ts
```

Expected: 5 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/db.test.ts
git commit -m "test(phase-1): verify concurrency guard throws EdgeLiteConcurrencyError"
```

---

### Task 7: Wire autoMigrate option (stub — fully implemented in Phase 6)

**Files:**
- Modify: `src/db.ts`
- Modify: `src/__tests__/db.test.ts`

- [ ] **Step 1: Add autoMigrate acceptance test**

```typescript
describe('autoMigrate option', () => {
  it('accepts autoMigrate: true without throwing (stub — full wiring in Phase 6)', async () => {
    const db = await openDb(TEST_DB, './schema.esdl', { autoMigrate: true });
    expect(db).toBeDefined();
    await closeDb(db);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test src/__tests__/db.test.ts
```

Expected: 6 pass, 0 fail.

- [ ] **Step 3: Final typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/db.ts src/__tests__/db.test.ts
git commit -m "feat(phase-1): wire autoMigrate option stub; all Phase 1 tests green"
```

---

### Phase 1 Deliverable Verification

- [ ] Run full test suite

```bash
pnpm test
```

Expected: all tests pass.

- [ ] Confirm `openDb('./test-db', './schema.esdl')` creates a real PGlite data directory with `_edgelite_migrations` table.
