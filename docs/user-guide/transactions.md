---
title: Transactions
---

# Transactions

By default every `db.run()` is a single, immediately-committed statement. When you
need several writes to succeed or fail **together**, wrap them in a transaction:

```typescript
await db.transaction(async (tx) => {
  const node = await tx.run(e.insert(e.Node, { kind: 'note', content: 'hello' }));
  await tx.run(e.insert(e.Edge, { src: parentId, dst: node.id, kind: 'child_of' }));
});
```

The callback receives a transaction-scoped `Db` handle. Use `tx.run()` exactly like
`db.run()` — the queries just execute inside the transaction.

## Commit and rollback

- **Commit** — if the callback resolves, the transaction commits and
  `db.transaction()` returns whatever the callback returned.
- **Rollback** — if the callback throws (or returns a rejected promise), the
  transaction is rolled back and the error propagates. No partial writes remain.

```typescript
const insertedId = await db.transaction(async (tx) => {
  const node = await tx.run(e.insert(e.Node, { kind: 'note', content: 'hi' }));
  return node.id; // becomes the resolved value of db.transaction(...)
});

// To roll back, just throw:
await db.transaction(async (tx) => {
  await tx.run(e.insert(e.Node, { kind: 'note', content: 'temp' }));
  throw new Error('changed my mind'); // nothing is persisted
});
```

## Sequential execution

edgelite runs queries one at a time. A transaction holds that sequential lock for
its **entire** duration, so a bare `db.run()` issued while a transaction is open
throws `EdgeLiteConcurrencyError`. Always `await` your `tx.run()` calls inside the
callback, and don't fire `db.run()` against the same handle concurrently.

## Nested transactions (savepoints)

Transactions can be nested. Each nested `tx.transaction()` is backed by a Postgres
`SAVEPOINT`, so a nested block that throws rolls back **only its own writes** while
the outer transaction continues:

```typescript
await db.transaction(async (tx) => {
  await tx.run(e.insert(e.Node, { kind: 'note', content: 'kept' }));

  try {
    await tx.transaction(async (inner) => {
      await inner.run(e.insert(e.Node, { kind: 'note', content: 'discarded' }));
      throw new Error('roll back just this part');
    });
  } catch {
    // The inner write is gone; the outer write is still pending.
  }

  // Commits with only the 'kept' node.
});
```

## Restrictions

- `tx.close()` inside a transaction throws `EdgeLiteRuntimeError` — close the
  database after the transaction returns, via `db.close()` / `closeDb(db)`.
- The `tx` handle is only valid inside the callback. Holding onto it and calling
  `tx.run()` after `db.transaction()` has resolved throws `EdgeLiteRuntimeError`.
