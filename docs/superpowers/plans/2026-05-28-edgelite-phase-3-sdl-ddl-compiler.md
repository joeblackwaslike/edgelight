# EdgeLite Phase 3 — SDL → DDL Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a parsed `SdlAst`, produce an ordered array of Postgres DDL SQL strings that can be executed against PGlite to create the schema. Each SDL construct maps to exactly one DDL output — see the spec's "SDL → DDL mapping" table for the complete mapping.

**Architecture:** `src/compiler/index.ts` exports `compileSdl(ast: SdlAst): string[]`. Each method handles one SDL construct type. Output is always a flat array of SQL strings (not a single concatenated string) so callers can apply them individually and track results. Enum values produce no DDL (app-layer only). `fts_vector TSVECTOR` column + GIN index + trigger is the fixed output for `index fts`. Column naming convention: link `parent` → FK column `parent_id`.

**Tech Stack:** pnpm, TypeScript, Vitest

---

## Files

- Create: `src/compiler/index.ts` — `compileSdl()` and all DDL generation logic
- Create: `src/compiler/__tests__/compiler.test.ts` — unit tests

---

### Task 1: CREATE TABLE for each ObjectType

**Files:**
- Create: `src/compiler/index.ts`
- Create: `src/compiler/__tests__/compiler.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/compiler/__tests__/compiler.test.ts
import { describe, it, expect } from 'vitest';
import { compileSdl } from '../index.js';
import type { SdlAst } from '../../parser/ast.js';

describe('compileSdl — CREATE TABLE', () => {
  it('emits CREATE TABLE for each ObjectType with id column', () => {
    const ast: SdlAst = {
      enums: [],
      types: [{
        kind: 'object_type',
        name: 'Node',
        properties: [],
        links: [],
        indexes: [],
        constraints: [],
      }],
    };
    const sql = compileSdl(ast);
    expect(sql.some(s => s.includes('CREATE TABLE nodes'))).toBe(true);
    expect(sql.some(s => s.includes('id TEXT PRIMARY KEY'))).toBe(true);
  });

  it('table name is pluralized lowercase', () => {
    const ast: SdlAst = {
      enums: [],
      types: [{ kind: 'object_type', name: 'Edge', properties: [], links: [], indexes: [], constraints: [] }],
    };
    const sql = compileSdl(ast);
    expect(sql.some(s => s.includes('CREATE TABLE edges'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/compiler/__tests__/compiler.test.ts
```

Expected: FAIL — "Cannot find module '../index.js'"

- [ ] **Step 3: Implement CREATE TABLE skeleton**

```typescript
// src/compiler/index.ts
import type { SdlAst, ObjectTypeNode, PropertyNode, LinkNode, IndexNode, ExclusiveConstraintNode, ScalarKind, VectorTypeNode } from '../parser/ast.js';

export function compileSdl(ast: SdlAst): string[] {
  const statements: string[] = [];
  for (const type of ast.types) {
    statements.push(...compileObjectType(type));
  }
  return statements;
}

function tableName(typeName: string): string {
  return typeName.toLowerCase() + 's';
}

function compileObjectType(type: ObjectTypeNode): string[] {
  const table = tableName(type.name);
  const columns: string[] = ['id TEXT PRIMARY KEY'];
  const linkNames = new Set(type.links.map(l => l.name));

  for (const prop of type.properties) {
    columns.push(compileProperty(prop));
  }
  for (const link of type.links) {
    columns.push(compileLink(link));
  }
  for (const constraint of type.constraints) {
    columns.push(compileConstraint(constraint, linkNames));
  }

  const statements: string[] = [
    `CREATE TABLE ${table} (\n  ${columns.join(',\n  ')}\n)`,
  ];

  // FTS column (separate ALTER + trigger) and vector indexes come after CREATE TABLE
  for (const idx of type.indexes) {
    statements.push(...compileIndex(idx, table));
  }

  return statements;
}

function compileProperty(prop: PropertyNode): string {
  const colType = scalarToSql(prop.type);
  const notNull = prop.required ? ' NOT NULL' : '';
  const defaultClause = prop.default !== undefined ? ` DEFAULT ${sqlLiteral(prop.default)}` : '';
  return `${prop.name} ${colType}${notNull}${defaultClause}`;
}

function scalarToSql(type: ScalarKind | VectorTypeNode): string {
  if (typeof type === 'object' && type.kind === 'vector') return `vector(${type.dimensions})`;
  switch (type) {
    case 'str': return 'TEXT';
    case 'int64': return 'BIGINT';
    case 'bool': return 'BOOLEAN';
    case 'json': return 'JSONB';
    default: return 'TEXT'; // enum type reference — stored as TEXT
  }
}

function sqlLiteral(val: string | number | boolean): string {
  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return String(val);
}

function compileLink(link: LinkNode): string {
  const refTable = tableName(link.targetType);
  const notNull = link.required ? ' NOT NULL' : '';
  return `${link.name}_id TEXT${notNull} REFERENCES ${refTable}(id)`;
}

function compileConstraint(c: ExclusiveConstraintNode, linkNames: Set<string>): string {
  // Use the enclosing type's link set to decide which properties need the _id suffix.
  // Link fields → ${name}_id (the FK column). Scalar fields → name as-is.
  const cols = c.properties.map(p => linkNames.has(p) ? `${p}_id` : p).join(', ');
  return `UNIQUE(${cols})`;
}

function compileIndex(idx: IndexNode, table: string): string[] {
  if (idx.kind === 'index_fts') {
    return compileFtsIndex(idx.property, table);
  }
  if (idx.kind === 'index_vec') {
    return [`CREATE INDEX ON ${table} USING ivfflat (${idx.property} vector_cosine_ops)`];
  }
  return [];
}

function compileFtsIndex(property: string, table: string): string[] {
  return [
    `ALTER TABLE ${table} ADD COLUMN fts_vector TSVECTOR`,
    `CREATE INDEX ON ${table} USING GIN (fts_vector)`,
    `CREATE OR REPLACE FUNCTION ${table}_fts_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector := to_tsvector('english', COALESCE(NEW.${property}, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
    `CREATE TRIGGER ${table}_fts_trigger
BEFORE INSERT OR UPDATE ON ${table}
FOR EACH ROW EXECUTE FUNCTION ${table}_fts_update()`,
  ];
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/compiler/__tests__/compiler.test.ts
```

Expected: 2 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/index.ts src/compiler/__tests__/compiler.test.ts
git commit -m "feat(phase-3): compileSdl CREATE TABLE skeleton"
```

---

### Task 2: Test all property types and defaults

**Files:**
- Modify: `src/compiler/__tests__/compiler.test.ts`

- [ ] **Step 1: Add property type tests**

```typescript
describe('compileSdl — property types', () => {
  function compileType(props: PropertyNode[]): string {
    return compileSdl({
      enums: [],
      types: [{ kind: 'object_type', name: 'Node', properties: props, links: [], indexes: [], constraints: [] }],
    }).find(s => s.includes('CREATE TABLE'))!;
  }

  it('str → TEXT NOT NULL (required)', () => {
    const sql = compileType([{ kind: 'property', name: 'content', type: 'str', required: true }]);
    expect(sql).toContain('content TEXT NOT NULL');
  });

  it('str → TEXT (optional)', () => {
    const sql = compileType([{ kind: 'property', name: 'source_uri', type: 'str', required: false }]);
    expect(sql).toContain('source_uri TEXT');
    expect(sql).not.toContain('NOT NULL');
  });

  it('int64 → BIGINT NOT NULL', () => {
    const sql = compileType([{ kind: 'property', name: 'created_at', type: 'int64', required: true }]);
    expect(sql).toContain('created_at BIGINT NOT NULL');
  });

  it('bool with default false', () => {
    const sql = compileType([{ kind: 'property', name: 'truncated', type: 'bool', required: true, default: false }]);
    expect(sql).toContain("truncated BOOLEAN NOT NULL DEFAULT FALSE");
  });

  it('json with default {}', () => {
    const sql = compileType([{ kind: 'property', name: 'metadata', type: 'json', required: false, default: '{}' }]);
    expect(sql).toContain("metadata JSONB DEFAULT '{}'");
  });

  it('vector(1536) → vector(1536)', () => {
    const sql = compileType([{ kind: 'property', name: 'embedding', type: { kind: 'vector', dimensions: 1536 }, required: false }]);
    expect(sql).toContain('embedding vector(1536)');
  });

  it('str with empty string default', () => {
    const sql = compileType([{ kind: 'property', name: 'content', type: 'str', required: true, default: '' }]);
    expect(sql).toContain("content TEXT NOT NULL DEFAULT ''");
  });
});
```

Add import at top:
```typescript
import type { PropertyNode } from '../../parser/ast.js';
```

- [ ] **Step 2: Run tests**

```bash
pnpm test src/compiler/__tests__/compiler.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/compiler/__tests__/compiler.test.ts
git commit -m "test(phase-3): property type and default mapping coverage"
```

---

### Task 3: Test link compilation (FK column)

**Files:**
- Modify: `src/compiler/__tests__/compiler.test.ts`

- [ ] **Step 1: Add link tests**

```typescript
describe('compileSdl — links', () => {
  it('link parent: Node → parent_id TEXT REFERENCES nodes(id)', () => {
    const ast: SdlAst = {
      enums: [],
      types: [{
        kind: 'object_type', name: 'Node', properties: [],
        links: [{ kind: 'link', name: 'parent', targetType: 'Node', required: false }],
        indexes: [], constraints: [],
      }],
    };
    const sql = compileSdl(ast).find(s => s.includes('CREATE TABLE'))!;
    expect(sql).toContain('parent_id TEXT REFERENCES nodes(id)');
  });

  it('required link src: Node → src_id TEXT NOT NULL REFERENCES nodes(id)', () => {
    const ast: SdlAst = {
      enums: [],
      types: [{
        kind: 'object_type', name: 'Edge', properties: [],
        links: [{ kind: 'link', name: 'src', targetType: 'Node', required: true }],
        indexes: [], constraints: [],
      }],
    };
    const sql = compileSdl(ast).find(s => s.includes('CREATE TABLE'))!;
    expect(sql).toContain('src_id TEXT NOT NULL REFERENCES nodes(id)');
  });
});
```

- [ ] **Step 2: Update compileLink to support `required`**

In `src/compiler/index.ts`, the `compileLink` function already handles `required`. Verify by running tests.

```bash
pnpm test src/compiler/__tests__/compiler.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/compiler/__tests__/compiler.test.ts
git commit -m "test(phase-3): link FK column compilation"
```

---

### Task 4: Test FTS index compilation

**Files:**
- Modify: `src/compiler/__tests__/compiler.test.ts`

- [ ] **Step 1: Add FTS test**

```typescript
describe('compileSdl — FTS index', () => {
  it('emits fts_vector TSVECTOR column, GIN index, and trigger', () => {
    const ast: SdlAst = {
      enums: [],
      types: [{
        kind: 'object_type', name: 'Node',
        properties: [{ kind: 'property', name: 'content', type: 'str', required: true }],
        links: [], constraints: [],
        indexes: [{ kind: 'index_fts', property: 'content' }],
      }],
    };
    const statements = compileSdl(ast);
    const ftsCol = statements.find(s => s.includes('fts_vector TSVECTOR'));
    const ginIdx = statements.find(s => s.includes('USING GIN') && s.includes('fts_vector'));
    const trigger = statements.find(s => s.includes('nodes_fts_trigger'));
    expect(ftsCol).toBeDefined();
    expect(ginIdx).toBeDefined();
    expect(trigger).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test src/compiler/__tests__/compiler.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/compiler/__tests__/compiler.test.ts
git commit -m "test(phase-3): FTS index → fts_vector column + GIN index + trigger"
```

---

### Task 5: Test UNIQUE constraint (link-aware) and compile full memtree schema

**Files:**
- Modify: `src/compiler/__tests__/compiler.test.ts`

- [ ] **Step 1: Add constraint test**

```typescript
describe('compileSdl — exclusive constraint', () => {
  it('exclusive on (src, dst, kind) → UNIQUE(src_id, dst_id, kind)', () => {
    const ast: SdlAst = {
      enums: [],
      types: [{
        kind: 'object_type', name: 'Edge', properties: [],
        links: [
          { kind: 'link', name: 'src', targetType: 'Node', required: true },
          { kind: 'link', name: 'dst', targetType: 'Node', required: true },
        ],
        indexes: [],
        constraints: [{ kind: 'constraint_exclusive', properties: ['src', 'dst', 'kind'] }],
      }],
    };
    const sql = compileSdl(ast).find(s => s.includes('CREATE TABLE'))!;
    expect(sql).toContain('UNIQUE(src_id, dst_id, kind)');
  });
});
```

- [ ] **Step 2: Add memtree full-schema compile test**

```typescript
import { parseSdl } from '../../parser/index.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('compileSdl — full memtree schema', () => {
  it('compiles memtree schema to valid DDL without throwing', () => {
    const source = readFileSync(
      join(__dirname, '../../parser/__tests__/fixtures/memtree.esdl'),
      'utf-8',
    );
    const ast = parseSdl(source);
    const statements = compileSdl(ast);

    expect(statements.some(s => s.includes('CREATE TABLE nodes'))).toBe(true);
    expect(statements.some(s => s.includes('CREATE TABLE edges'))).toBe(true);
    expect(statements.some(s => s.includes('fts_vector TSVECTOR'))).toBe(true);
    expect(statements.some(s => s.includes('UNIQUE(src_id, dst_id, kind)'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run all compiler tests**

```bash
pnpm test src/compiler/__tests__/compiler.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/index.ts src/compiler/__tests__/compiler.test.ts
git commit -m "feat(phase-3): compileSdl complete — all DDL mappings + full memtree schema test"
```

---

### Phase 3 Deliverable Verification

- [ ] `compileSdl(parseSdl(memtreeSchema))` returns an ordered array of SQL strings covering `CREATE TABLE nodes`, `CREATE TABLE edges`, FTS column + trigger, vector index, and UNIQUE constraint — with no thrown exceptions.
