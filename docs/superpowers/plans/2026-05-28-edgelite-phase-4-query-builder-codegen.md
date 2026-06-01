# EdgeLite Phase 4 — Query Builder Codegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `edgelite codegen` — reads `schema.esdl`, produces `dbschema/edgelite.ts`. The generated file exports `e.Node`, `e.Edge`, all enum const objects, builder factories (`e.select`, `e.insert`, `e.update`, `e.count`), and helpers (`e.op`, `e.all`, `e.any`, `e.neighbors`, `e.fts`). All builder methods return opaque builder objects — no SQL is generated here; that happens in Phase 5.

**Architecture:** `src/codegen/index.ts` is the code generator: takes `SdlAst`, returns a TypeScript source string. `cli/index.ts` wires the `codegen` command. Builder objects are typed interfaces defined in `src/codegen/builders.ts` — these are what the runtime (Phase 5) will dispatch on. The generated `dbschema/edgelite.ts` imports the builder types and instantiates them.

**Tech Stack:** pnpm, TypeScript, Vitest

---

## Files

- Create: `src/codegen/builders.ts` — builder interface types (SelectBuilder, InsertBuilder, etc.)
- Create: `src/codegen/index.ts` — `generateQueryBuilder(ast): string`
- Create: `src/codegen/__tests__/codegen.test.ts` — unit tests on generated source
- Modify: `cli/index.ts` — wire `edgelite codegen` command

---

### Task 1: Define builder interface types

**Files:**
- Create: `src/codegen/builders.ts`

- [ ] **Step 1: Write builders.ts**

These interfaces are the contract between codegen output and the runtime (Phase 5). Every `db.run()` call receives one of these.

```typescript
// src/codegen/builders.ts

export type FilterExpr = OpExpr | AllExpr | AnyExpr;

export interface OpExpr {
  kind: 'op';
  left: FieldRef;
  operator: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'LIKE';
  right: unknown;
}

export interface FieldRef {
  kind: 'field';
  table: string;
  column: string;
}

export interface AllExpr {
  kind: 'all';
  exprs: FilterExpr[];
}

export interface AnyExpr {
  kind: 'any';
  exprs: FilterExpr[];
}

export interface OrderByClause {
  expr: FieldRef;
  dir: 'ASC' | 'DESC';
}

export interface SelectShape {
  [field: string]: boolean | SelectShape;
}

export interface SelectBuilder<T> {
  kind: 'select';
  table: string;
  shape: SelectShape;
  filter?: FilterExpr;
  order_by?: OrderByClause;
  limit?: number;
  _type: T;
}

export interface InsertBuilder<T> {
  kind: 'insert';
  table: string;
  /** Link field names from the type handle — runtime uses these to remap {link: id} → {link_id: id} columns. */
  _links: readonly string[];
  data: Record<string, unknown>;
  onConflict?: 'ignore';
  _type: T;
  unlessConflict(): InsertBuilder<T>;
}

export interface UpdateBuilder<T> {
  kind: 'update';
  table: string;
  filter: FilterExpr;
  set: Record<string, unknown>;
  _type: T;
}

export interface CountBuilder {
  kind: 'count';
  table: string;
  filter?: FilterExpr;
}

export interface NeighborsBuilder<T> {
  kind: 'neighbors';
  nodeId: string;
  edgeKinds: string[];
  _type: T;
}

export interface FtsBuilder<T> {
  kind: 'fts';
  table: string;
  query: string;
  _type: T;
}

export type Query<T> =
  | SelectBuilder<T>
  | InsertBuilder<T>
  | UpdateBuilder<T>
  | CountBuilder
  | NeighborsBuilder<T>
  | FtsBuilder<T>;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/codegen/builders.ts
git commit -m "feat(phase-4): define query builder interface types"
```

---

### Task 2: Implement the code generator

**Files:**
- Create: `src/codegen/index.ts`
- Create: `src/codegen/__tests__/codegen.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/codegen/__tests__/codegen.test.ts
import { describe, it, expect } from 'vitest';
import { generateQueryBuilder } from '../index.js';
import { parseSdl } from '../../parser/index.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const memtreeSchema = readFileSync(
  join(__dirname, '../../parser/__tests__/fixtures/memtree.esdl'),
  'utf-8',
);

describe('generateQueryBuilder', () => {
  it('generates TypeScript source without throwing', () => {
    const ast = parseSdl(memtreeSchema);
    const src = generateQueryBuilder(ast);
    expect(typeof src).toBe('string');
    expect(src.length).toBeGreaterThan(100);
  });

  it('exports e.Node and e.Edge type objects', () => {
    const src = generateQueryBuilder(parseSdl(memtreeSchema));
    expect(src).toContain('Node:');
    expect(src).toContain('Edge:');
  });

  it('includes all NodeKind enum values', () => {
    const src = generateQueryBuilder(parseSdl(memtreeSchema));
    expect(src).toContain("session:");
    expect(src).toContain("web_chunk:");
  });

  it('includes select, insert, update, count, op, all, any, neighbors, fts', () => {
    const src = generateQueryBuilder(parseSdl(memtreeSchema));
    for (const fn of ['select', 'insert', 'update', 'count', 'op', 'all', 'any', 'neighbors', 'fts']) {
      expect(src).toContain(`${fn}(`);
    }
  });

  it('InsertBuilder has unlessConflict method', () => {
    const src = generateQueryBuilder(parseSdl(memtreeSchema));
    expect(src).toContain('unlessConflict');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/codegen/__tests__/codegen.test.ts
```

Expected: FAIL — "Cannot find module '../index.js'"

- [ ] **Step 3: Implement generateQueryBuilder**

```typescript
// src/codegen/index.ts
import type { SdlAst, ObjectTypeNode, ScalarEnumNode } from '../parser/ast.js';

export function generateQueryBuilder(ast: SdlAst): string {
  const lines: string[] = [
    `// GENERATED — do not edit. Regenerate with: edgelite codegen`,
    `// This file is gitignored. Import it via a relative path from the consuming project root.`,
    `import type { Query, SelectBuilder, InsertBuilder, UpdateBuilder, CountBuilder, NeighborsBuilder, FtsBuilder, FilterExpr, FieldRef, OrderByClause, OpExpr, AllExpr, AnyExpr } from 'edgelite/codegen';`,
    ``,
  ];

  // Emit enum const objects
  for (const en of ast.enums) {
    lines.push(...generateEnumConst(en));
  }

  // Emit type handle objects (e.Node, e.Edge, ...)
  for (const type of ast.types) {
    lines.push(...generateTypeHandle(type));
  }

  // Emit the e object
  lines.push(`const e = {`);
  for (const type of ast.types) {
    lines.push(`  ${type.name},`);
  }
  for (const en of ast.enums) {
    lines.push(`  ${en.name},`);
  }
  lines.push(`  select<T>(typeHandle: TypeHandle, shape: (ref: any) => any): SelectBuilder<T> {`);
  lines.push(`    const ref = makeRef(typeHandle._table, typeHandle._links);`);
  lines.push(`    const resolved = shape(ref);`);
  lines.push(`    const { filter, order_by, limit, ...fields } = resolved;`);
  lines.push(`    return { kind: 'select', table: typeHandle._table, shape: fields, filter, order_by, limit } as SelectBuilder<T>;`);
  lines.push(`  },`);
  lines.push(`  insert<T>(typeHandle: TypeHandle, data: Record<string, unknown>): InsertBuilder<T> {`);
  lines.push(`    const builder: InsertBuilder<T> = {`);
  lines.push(`      kind: 'insert', table: typeHandle._table, _links: typeHandle._links, data,`);
  lines.push(`      _type: undefined as unknown as T,`);
  lines.push(`      unlessConflict() { return { ...this, onConflict: 'ignore' }; },`);
  lines.push(`    };`);
  lines.push(`    return builder;`);
  lines.push(`  },`);
  lines.push(`  update<T>(typeHandle: TypeHandle, fn: (ref: any) => { filter: FilterExpr; set: Record<string, unknown> }): UpdateBuilder<T> {`);
  lines.push(`    const ref = makeRef(typeHandle._table, typeHandle._links);`);
  lines.push(`    const { filter, set } = fn(ref);`);
  lines.push(`    return { kind: 'update', table: typeHandle._table, filter, set } as UpdateBuilder<T>;`);
  lines.push(`  },`);
  lines.push(`  count(typeHandle: TypeHandle, fn?: (ref: any) => { filter?: FilterExpr }): CountBuilder {`);
  lines.push(`    const ref = makeRef(typeHandle._table, typeHandle._links);`);
  lines.push(`    const filter = fn ? fn(ref).filter : undefined;`);
  lines.push(`    return { kind: 'count', table: typeHandle._table, filter };`);
  lines.push(`  },`);
  lines.push(`  op(left: FieldRef, operator: OpExpr['operator'], right: unknown): OpExpr {`);
  lines.push(`    return { kind: 'op', left, operator, right };`);
  lines.push(`  },`);
  lines.push(`  all(...exprs: FilterExpr[]): AllExpr { return { kind: 'all', exprs }; },`);
  lines.push(`  any(...exprs: FilterExpr[]): AnyExpr { return { kind: 'any', exprs }; },`);
  lines.push(`  neighbors<T>(nodeId: string, opts: { edgeKinds: string[] }): NeighborsBuilder<T> {`);
  lines.push(`    return { kind: 'neighbors', nodeId, edgeKinds: opts.edgeKinds } as NeighborsBuilder<T>;`);
  lines.push(`  },`);
  lines.push(`  fts<T>(typeHandle: TypeHandle, query: string): FtsBuilder<T> {`);
  lines.push(`    return { kind: 'fts', table: typeHandle._table, query } as FtsBuilder<T>;`);
  lines.push(`  },`);
  lines.push(`};`);
  lines.push(``);
  lines.push(`export default e;`);
  lines.push(``);
  lines.push(`// ── Internal helpers ────────────────────────────────────────────────`);
  lines.push(`interface TypeHandle { _table: string; _links: readonly string[]; }`);
  lines.push(`function makeRef(table: string, links: readonly string[]): Record<string, FieldRef> {`);
  lines.push(`  const linkSet = new Set(links);`);
  lines.push(`  return new Proxy({} as Record<string, FieldRef>, {`);
  lines.push(`    // Link fields resolve to the FK column name (e.g. parent → parent_id).`);
  lines.push(`    // This ensures filter exprs like e.op(n.parent, '=', id) compile correctly.`);
  lines.push(`    get(_, prop: string) {`);
  lines.push(`      const column = linkSet.has(prop) ? \`\${prop}_id\` : prop;`);
  lines.push(`      return { kind: 'field', table, column };`);
  lines.push(`    },`);
  lines.push(`  });`);
  lines.push(`}`);

  return lines.join('\n');
}

function generateEnumConst(en: ScalarEnumNode): string[] {
  const entries = en.values.map(v => `  ${v}: '${v}' as const`).join(',\n');
  return [
    `const ${en.name} = {`,
    entries,
    `};`,
    ``,
  ];
}

function generateTypeHandle(type: ObjectTypeNode): string[] {
  const links = type.links.map(l => `'${l.name}'`).join(', ');
  return [
    `const ${type.name} = { _table: '${type.name.toLowerCase()}s', _links: [${links}] as const };`,
    ``,
  ];
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/codegen/__tests__/codegen.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/codegen/index.ts src/codegen/__tests__/codegen.test.ts
git commit -m "feat(phase-4): generateQueryBuilder emits e object with all builders"
```

---

### Task 3: Wire `edgelite codegen` CLI command

**Files:**
- Modify: `cli/index.ts`

- [ ] **Step 1: Update cli/index.ts**

```typescript
#!/usr/bin/env bun
import { parseSdl } from '../src/parser/index.js';
import { generateQueryBuilder } from '../src/codegen/index.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [, , command, ...args] = process.argv;
const schemaPath = args[0] ?? 'dbschema/schema.esdl';
const outPath = 'dbschema/edgelite.ts';

switch (command) {
  case 'codegen': {
    const source = readFileSync(schemaPath, 'utf-8');
    const ast = parseSdl(source);
    const ts = generateQueryBuilder(ast);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, ts, 'utf-8');
    console.log(`✓ Generated ${outPath} from ${schemaPath}`);
    break;
  }
  case 'migration':
    console.error(`'migration' command not yet implemented — Phase 6`);
    process.exit(1);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: edgelite codegen [schema.esdl]');
    process.exit(1);
}
```

- [ ] **Step 2: Test codegen CLI against memtree fixture**

```bash
node --loader ts-node/esm cli/index.ts codegen src/parser/__tests__/fixtures/memtree.esdl
```

Expected:
```
✓ Generated dbschema/edgelite.ts from src/parser/__tests__/fixtures/memtree.esdl
```

- [ ] **Step 3: Verify generated file is valid TypeScript**

```bash
pnpm typecheck
```

Expected: exits 0 (or only errors about generated file's type imports, which are acceptable at this stage).

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/index.ts
git commit -m "feat(phase-4): wire edgelite codegen CLI command"
```

---

### Phase 4 Deliverable Verification

- [ ] Run `node --loader ts-node/esm cli/index.ts codegen src/parser/__tests__/fixtures/memtree.esdl`
- [ ] Confirm `dbschema/edgelite.ts` exists and contains `e.Node`, `e.Edge`, all enum values, and all builder factories.
- [ ] `bun test` — all pass.
