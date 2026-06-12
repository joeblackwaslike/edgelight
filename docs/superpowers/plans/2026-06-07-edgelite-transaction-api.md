# Plan: Public Transaction API for edgelite (issue #16)

## Context

edgelite is an EdgeDB-style ORM over PGlite (WASM Postgres). Its public `Db`
interface (`run()`, `close()`, `path`) has **no transaction mechanism**, even
though the underlying PGlite already supports `pglite.transaction()`. Every
`db.run()` is a single auto-committed statement, so consumers can't group
multiple mutations atomically.

The downstream consumer **ctx-tree** hit this: its edgelite store backend
implements `atomicBatchFilter` and `atomicPruneAndSupersede`, which run multiple
mutations **sequentially without real atomicity** — a partial-write risk on
mid-batch failure (the SQLite backend gets true transactions; edgelite silently
doesn't). That's [issue #16 — "Expose a public transaction API on Db"](https://github.com/joeblackwaslike/edgelite/issues/16).

Note: the `atomic*` methods live in **ctx-tree**, not in edgelite — there are no
methods named "atomic" in this repo. The actual gap is the missing transaction
API here.

**Outcome:** add `transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>` to the
public `Db`. The callback gets a transaction-scoped `Db` whose `run()` executes
inside the transaction; resolving commits, throwing rolls back and propagates.
Nested transactions are supported via Postgres **SAVEPOINT**s.

## Why this is clean plumbing

- `execute()` (`src/runtime/execute.ts`) uses **only** `pglite.query(sql, params)` and reads `result.rows`.
- PGlite's `Transaction` type (`pglite-Csk75SCB.d.ts:517`) has an **identical** `query<T>(sql, params?, options?): Promise<Results<T>>` plus `rollback()`. So a transaction handle can reuse the exact same execution path.
- `Results<T>.rows` is `T[]`, so a minimal structural `{ query<T>(sql, params?): Promise<{ rows: T[] }> }` is satisfied by **both** `PGlite` and `Transaction`.

## Design decisions (confirmed with user)

- **Scope:** edgelite fix + tests + a Docusaurus docs page. ctx-tree migration is a follow-up, not in this plan.
- **Nesting:** real SAVEPOINTs (`SAVEPOINT` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT`) issued through the PGlite `Transaction` handle, so nested `tx.transaction()` blocks are independently atomic.
- **`tx.close()` inside a transaction:** throws `EdgeLiteRuntimeError` (closing mid-transaction is invalid).
- **Rollback:** throw-to-rollback (the issue's proposed semantics) — no explicit rollback method on `Db`.

## Changes

### 1. `src/runtime/execute.ts` — retype `execute()` structurally
Add and export a minimal executor interface; change the first param from `PGlite` to it; drop the now-unused `PGlite` import. Body is untouched.
```ts
/** Minimal surface execute() needs. Satisfied by PGlite and PGlite Transaction. */
export interface QueryExecutor {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export async function execute<T>(executor: QueryExecutor, query: Query<T>): Promise<T> {
  const compiled = compileQuery(query);
  const result = await executor.query<Record<string, unknown>>(compiled.sql, compiled.params);
  // ...rest unchanged...
}
```

### 2. `src/types.ts` — add `transaction()` to the `Db` interface
Insert between `run()` and `close()`, with JSDoc covering commit/rollback, the held sequential lock, savepoint-based nesting, and that `close()` inside a tx throws:
```ts
transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
```
`InternalDb` needs no change.

### 3. `src/db.ts` — implement on `DbImpl` + add a `TxDb` handle
Update imports: add `Transaction` from `@electric-sql/pglite` and `EdgeLiteRuntimeError` from `./errors.js`.

`DbImpl.transaction()` holds the **same `inFlight` lock** for the whole transaction (so a bare `run()` issued concurrently throws `EdgeLiteConcurrencyError`), then delegates to PGlite. A shared mutable counter generates unique savepoint names across the nesting tree:
```ts
async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (this.inFlight) {
    throw new EdgeLiteConcurrencyError('db.transaction() called while another query is in flight');
  }
  this.inFlight = true;
  try {
    return await this.pglite.transaction(async (tx) =>
      fn(new TxDb(tx, this.path, { n: 0 })),
    );
  } finally {
    this.inFlight = false;
  }
}
```

`TxDb` (kept in `src/db.ts`, never exported — depends on `execute`, `Query`, `Transaction`, error types already in scope):
```ts
class TxDb implements Db {
  readonly path: string;
  private readonly tx: Transaction;
  private readonly counter: { n: number };

  constructor(tx: Transaction, path: string, counter: { n: number }) {
    this.tx = tx;
    this.path = path;
    this.counter = counter;
  }

  // No inFlight guard: the outer DbImpl lock + PGlite's transaction mutex serialize calls.
  async run<T>(query: unknown): Promise<T> {
    return execute<T>(this.tx, query as Query<T>);
  }

  // Nested transactions via SAVEPOINT — counter-based names are unique and valid identifiers.
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const name = `edgelite_sp_${this.counter.n++}`;
    await this.tx.query(`SAVEPOINT ${name}`);
    try {
      const result = await fn(new TxDb(this.tx, this.path, this.counter));
      await this.tx.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      await this.tx.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw err;
    }
  }

  async close(): Promise<void> {
    throw new EdgeLiteRuntimeError('Cannot close the database inside a transaction');
  }
}
```
`tx` satisfies `QueryExecutor` structurally, so `execute(this.tx, ...)` type-checks.

### 4. `src/index.ts` — no change
`Db` is already exported; `transaction` is just a new method on it.

### 5. Tests — `src/__tests__/transaction.test.ts` (new, vitest)
Model on `src/runtime/__tests__/integration.test.ts` (parse+compile the `memtree.esdl` fixture, apply migrations, run real builder queries through `openDb`). Reuse its builder factories (`insertNode`, `nodeField`, `opEq`); use a dedicated temp data dir with `afterEach` `rmSync(..., { recursive: true })`.

Cases:
- **commit** — two inserts inside `db.transaction`; a post-tx select returns both rows.
- **rollback** — insert one row then `throw`; expect rejection; post-tx select returns **zero** rows.
- **return value** — `db.transaction(async () => 42)` resolves to `42`.
- **concurrency** — hold the tx open on a deferred promise; a concurrent `db.run()` rejects with `EdgeLiteConcurrencyError`; then resolve so the tx commits.
- **nested commit** — outer + nested `tx.transaction` both insert; both rows persist.
- **nested rollback (savepoint)** — outer inserts row A, nested inserts row B then throws and is caught inside the outer callback; after commit, row A persists and row B does **not** (savepoint rolled back without aborting the outer tx).
- **close inside tx** — `tx.close()` rejects with `EdgeLiteRuntimeError`.

### 6. Docs — `docs/user-guide/transactions.md` (new) + wiring
New page: when to use it, the `db.transaction(fn)` API, commit/throw-to-rollback semantics, the held sequential lock, and a nested-savepoint example. Then:
- Add `'user-guide/transactions'` to the **User Guide** category in `sidebars.ts`.
- Add a bullet link in `docs/user-guide/index.md`.

## Files
- `src/runtime/execute.ts` — add+export `QueryExecutor`; retype `execute()`; drop `PGlite` import.
- `src/types.ts` — add `transaction()` to `Db`.
- `src/db.ts` — imports; `DbImpl.transaction()`; `TxDb` class.
- `src/__tests__/transaction.test.ts` — **new**.
- `docs/user-guide/transactions.md` — **new**.
- `sidebars.ts`, `docs/user-guide/index.md` — register the docs page.

## Verification
- `pnpm typecheck` — confirms `PGlite` and `Transaction` both satisfy `QueryExecutor`.
- `pnpm test` — new `transaction.test.ts` (all 7 cases) plus existing suites green.
- `pnpm lint`.
- Manual sanity: `db.transaction(async tx => { await tx.run(insertA); await tx.run(insertB); })` commits both; throwing mid-callback leaves the store unchanged; a nested `tx.transaction` that throws rolls back only its own writes.

## Follow-up (out of scope)
Migrate ctx-tree's `atomicBatchFilter` / `atomicPruneAndSupersede` to wrap their `db.run()` mutations in `db.transaction(...)`, and close issue #16.
