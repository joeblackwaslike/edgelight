# EdgeLite Phase 2 — SDL Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a PEG parser for the v1 SDL subset using `peggy`. Given `schema.esdl` source text, return a typed `SdlAst` that downstream phases (compiler, codegen, migration) can consume. Throw `EdgeLiteParseError` with a useful message on any syntax error.

**Architecture:** `src/parser/grammar.pegjs` defines the grammar. `src/parser/ast.ts` defines all AST node types. `src/parser/index.ts` compiles the grammar at build time and exports `parseSdl(source)`. The grammar covers exactly the v1 SDL surface — no more. See the spec's "SDL Subset (v1)" section for the complete list of supported constructs.

**Tech Stack:** pnpm, TypeScript, `peggy` (PEG parser generator), Vitest

---

## Files

- Create: `src/parser/ast.ts` — all SDL AST node type definitions
- Create: `src/parser/grammar.pegjs` — PEG grammar source (human-readable reference; not read at runtime)
- Create: `src/parser/grammar.ts` — grammar exported as a TypeScript string constant (what the runtime imports)
- Create: `src/parser/index.ts` — `parseSdl()` export
- Create: `src/parser/__tests__/parser.test.ts` — unit tests
- Create: `src/parser/__tests__/fixtures/memtree.esdl` — memtree's full reference schema for round-trip test
- Modify: `package.json` — add `peggy` dependency

---

### Task 1: Install peggy and define AST types

**Files:**
- Modify: `package.json`
- Create: `src/parser/ast.ts`

- [ ] **Step 1: Install peggy**

```bash
pnpm add peggy
pnpm add -D @types/peggy
```

Expected: `peggy` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Write the AST types**

```typescript
// src/parser/ast.ts

export type ScalarKind = 'str' | 'int64' | 'bool' | 'json';

export interface PropertyNode {
  kind: 'property';
  name: string;
  type: ScalarKind | VectorTypeNode;
  required: boolean;
  default?: string | number | boolean;
}

export interface VectorTypeNode {
  kind: 'vector';
  dimensions: number;
}

export interface LinkNode {
  kind: 'link';
  name: string;
  targetType: string;
  required: boolean;
}

export interface EnumValueNode {
  value: string;
}

export interface ScalarEnumNode {
  kind: 'scalar_enum';
  name: string;
  values: string[];
}

export type FtsIndexNode = {
  kind: 'index_fts';
  property: string;
};

export type VecIndexNode = {
  kind: 'index_vec';
  property: string;
  using: 'ivfflat';
};

export type IndexNode = FtsIndexNode | VecIndexNode;

export interface ExclusiveConstraintNode {
  kind: 'constraint_exclusive';
  properties: string[];
}

export interface ObjectTypeNode {
  kind: 'object_type';
  name: string;
  properties: PropertyNode[];
  links: LinkNode[];
  indexes: IndexNode[];
  constraints: ExclusiveConstraintNode[];
}

export interface SdlAst {
  enums: ScalarEnumNode[];
  types: ObjectTypeNode[];
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/parser/ast.ts package.json bun.lockb
git commit -m "feat(phase-2): SDL AST type definitions and peggy dependency"
```

---

### Task 2: Write the PEG grammar

**Files:**
- Create: `src/parser/grammar.pegjs`

- [ ] **Step 1: Write the grammar**

```pegjs
// src/parser/grammar.pegjs
{{
  // Module-level code (available in generated parser)
}}
{
  // Per-parse initializer
}

SdlDocument
  = _ items:SdlItem* _ { return items; }

SdlItem
  = ScalarEnum / ObjectType

// ─── Scalar Enums ────────────────────────────────────────────────────────────

ScalarEnum
  = _ "scalar" __ "type" __ name:Identifier __ "extending" __ "enum" _ "<" _
    first:Identifier rest:(_ "," _ id:Identifier { return id; })* _
    ">" _ ";" _
  {
    return { kind: "scalar_enum", name, values: [first, ...rest] };
  }

// ─── Object Types ─────────────────────────────────────────────────────────────

ObjectType
  = _ "type" __ name:Identifier _ "{" _ members:TypeMember* _ "}" _
  {
    const properties = members.filter(m => m.kind === "property");
    const links      = members.filter(m => m.kind === "link");
    const indexes    = members.filter(m => m.kind === "index_fts" || m.kind === "index_vec");
    const constraints = members.filter(m => m.kind === "constraint_exclusive");
    return { kind: "object_type", name, properties, links, indexes, constraints };
  }

TypeMember
  = IndexDecl / ConstraintDecl / LinkDecl / PropertyDecl

// ─── Properties ───────────────────────────────────────────────────────────────

PropertyDecl
  = _ required:("required" __)? name:Identifier _ ":" _ type:TypeExpr
    opts:PropertyOpts? _ ";" _
  {
    const base = {
      kind: "property",
      name,
      type,
      required: required != null,
    };
    if (opts && opts.default !== undefined) {
      return { ...base, default: opts.default };
    }
    return base;
  }

PropertyOpts
  = _ "{" _ "default" _ ":=" _ val:DefaultValue _ "}" _
  { return { default: val }; }

DefaultValue
  = StringLiteral / NumberLiteral / BoolLiteral / JsonLiteral

StringLiteral
  = "'" chars:[^']* "'" { return chars.join(""); }

NumberLiteral
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

BoolLiteral
  = "true"  { return true;  }
  / "false" { return false; }

JsonLiteral
  = "'" _ "{" _ "}" _ "'" { return "{}"; }

TypeExpr
  = VectorType / ScalarType

VectorType
  = "vector" _ "(" _ dim:NumberLiteral _ ")"
  { return { kind: "vector", dimensions: dim }; }

ScalarType
  = "str"   { return "str";   }
  / "int64" { return "int64"; }
  / "bool"  { return "bool";  }
  / "json"  { return "json";  }
  / name:Identifier { return name; }   // enum type reference

// ─── Links ────────────────────────────────────────────────────────────────────

LinkDecl
  = _ required:("required" __)? name:Identifier _ ":" _ target:Identifier _ ";" _
  {
    // Only treat as link if target starts with uppercase (type reference)
    if (!/^[A-Z]/.test(target)) return null;
    return { kind: "link", name, targetType: target, required: required != null };
  }

// ─── Indexes ──────────────────────────────────────────────────────────────────

IndexDecl
  = FtsIndex / VecIndex

FtsIndex
  = _ "index" __ "fts" __ "on" _ "(" _ "." prop:Identifier _ ")" _ ";" _
  { return { kind: "index_fts", property: prop }; }

VecIndex
  = _ "index" __ "vec" __ "on" _ "(" _ "." prop:Identifier _ ")"
    __ "using" __ using:Identifier _ ";" _
  { return { kind: "index_vec", property: prop, using }; }

// ─── Constraints ──────────────────────────────────────────────────────────────

ConstraintDecl
  = _ "constraint" __ "exclusive" __ "on" _ "(" _ "(" _
    first:ConstraintProp rest:(_ "," _ p:ConstraintProp { return p; })* _
    ")" _ ")" _ ";" _
  { return { kind: "constraint_exclusive", properties: [first, ...rest] }; }

ConstraintProp
  = "." name:Identifier { return name; }

// ─── Terminals ────────────────────────────────────────────────────────────────

Identifier "identifier"
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* { return first + rest.join(""); }

__ "whitespace"
  = [ \t\n\r]+

_ "optional whitespace"
  = [ \t\n\r]* (Comment _)*

Comment
  = "#" [^\n]* "\n"?
```

- [ ] **Step 2: Typecheck (pegjs files are not TS, skip typecheck for now)**

No typecheck step — grammar is checked at parse time.

---

### Task 3: Create grammar.ts and implement parseSdl()

**Files:**
- Create: `src/parser/grammar.ts`
- Create: `src/parser/index.ts`

> **Why grammar.ts instead of readFileSync(grammar.pegjs):** The published `dist/` contains only compiled TypeScript output. A raw `.pegjs` file read at runtime would be missing from the published package and from any downstream consumer's `node_modules`. By exporting the grammar as a TypeScript string constant, it is compiled into `dist/parser/grammar.js` and ships with the package with no runtime filesystem dependency.

- [ ] **Step 1: Write the failing test**

```typescript
// src/parser/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSdl } from '../index.js';
import { EdgeLiteParseError } from '../../errors.js';

describe('parseSdl', () => {
  it('parses a minimal enum', () => {
    const ast = parseSdl(`scalar type NodeKind extending enum<session, file_chunk>;`);
    expect(ast.enums).toHaveLength(1);
    expect(ast.enums[0]!.name).toBe('NodeKind');
    expect(ast.enums[0]!.values).toEqual(['session', 'file_chunk']);
  });

  it('throws EdgeLiteParseError on invalid SDL', () => {
    expect(() => parseSdl(`not valid sdl !!!`)).toThrow(EdgeLiteParseError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/parser/__tests__/parser.test.ts
```

Expected: FAIL — "Cannot find module '../index.js'"

- [ ] **Step 3: Create grammar.ts — export the grammar as a TypeScript string constant**

Copy the full content of `src/parser/grammar.pegjs` into `src/parser/grammar.ts` as a tagged template literal:

```typescript
// src/parser/grammar.ts
// Grammar source embedded as a string so it ships with the compiled dist.
// Edit grammar.pegjs for readability, then update this constant to match.
export const GRAMMAR = `
// ... paste the full content of grammar.pegjs here verbatim ...
`;
```

The full grammar text (from Task 2's `grammar.pegjs`) is pasted into the template literal. No other changes.

- [ ] **Step 4: Implement parseSdl**

```typescript
// src/parser/index.ts
import { generate } from 'peggy';
import { GRAMMAR } from './grammar.js';
import type { SdlAst, ScalarEnumNode, ObjectTypeNode } from './ast.js';
import { EdgeLiteParseError } from '../errors.js';

// Parser is generated once at module load from the embedded grammar string.
// No filesystem read — works in published dist and in consumer projects.
const parser = generate(GRAMMAR);

export function parseSdl(source: string): SdlAst {
  let items: unknown[];
  try {
    items = parser.parse(source) as unknown[];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new EdgeLiteParseError(msg);
  }

  const enums: ScalarEnumNode[] = [];
  const types: ObjectTypeNode[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const node = item as { kind: string };
    if (node.kind === 'scalar_enum') enums.push(node as ScalarEnumNode);
    else if (node.kind === 'object_type') types.push(node as ObjectTypeNode);
  }

  return { enums, types };
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/parser/__tests__/parser.test.ts
```

Expected: 2 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/parser/grammar.pegjs src/parser/grammar.ts src/parser/index.ts src/parser/__tests__/parser.test.ts
git commit -m "feat(phase-2): SDL parser — parseSdl() with peggy grammar embedded as TS constant"
```

---

### Task 4: Test all v1 SDL constructs

**Files:**
- Modify: `src/parser/__tests__/parser.test.ts`

- [ ] **Step 1: Add property tests**

```typescript
  describe('ObjectType properties', () => {
    it('parses required and optional properties', () => {
      const ast = parseSdl(`
        type Node {
          required content: str;
          source_uri: str;
        }
      `);
      const node = ast.types[0]!;
      const content = node.properties.find(p => p.name === 'content')!;
      const uri = node.properties.find(p => p.name === 'source_uri')!;
      expect(content.required).toBe(true);
      expect(uri.required).toBe(false);
    });

    it('parses default values', () => {
      const ast = parseSdl(`
        type Node {
          required status: str { default := 'pending' };
          required mtime: int64 { default := 0 };
          required truncated: bool { default := false };
        }
      `);
      const node = ast.types[0]!;
      expect(node.properties.find(p => p.name === 'status')?.default).toBe('pending');
      expect(node.properties.find(p => p.name === 'mtime')?.default).toBe(0);
      expect(node.properties.find(p => p.name === 'truncated')?.default).toBe(false);
    });

    it('parses vector(N) property', () => {
      const ast = parseSdl(`
        type Node {
          embedding: vector(1536);
        }
      `);
      const prop = ast.types[0]!.properties[0]!;
      expect(prop.type).toEqual({ kind: 'vector', dimensions: 1536 });
    });
  });
```

- [ ] **Step 2: Add link, index, constraint tests**

```typescript
  describe('links, indexes, constraints', () => {
    it('parses a link', () => {
      const ast = parseSdl(`
        type Node {
          parent: Node;
        }
      `);
      const link = ast.types[0]!.links[0]!;
      expect(link.name).toBe('parent');
      expect(link.targetType).toBe('Node');
      expect(link.required).toBe(false);
    });

    it('parses index fts', () => {
      const ast = parseSdl(`
        type Node {
          required content: str;
          index fts on (.content);
        }
      `);
      const idx = ast.types[0]!.indexes[0]!;
      expect(idx.kind).toBe('index_fts');
      expect(idx.property).toBe('content');
    });

    it('parses index vec using ivfflat', () => {
      const ast = parseSdl(`
        type Node {
          embedding: vector(1536);
          index vec on (.embedding) using ivfflat;
        }
      `);
      const idx = ast.types[0]!.indexes[0]!;
      expect(idx.kind).toBe('index_vec');
      if (idx.kind === 'index_vec') expect(idx.using).toBe('ivfflat');
    });

    it('parses exclusive constraint', () => {
      const ast = parseSdl(`
        type Edge {
          required src: Node;
          required dst: Node;
          required kind: EdgeKind;
          constraint exclusive on ((.src, .dst, .kind));
        }
      `);
      const c = ast.types[0]!.constraints[0]!;
      expect(c.kind).toBe('constraint_exclusive');
      expect(c.properties).toEqual(['src', 'dst', 'kind']);
    });
  });
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/parser/__tests__/parser.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/parser/__tests__/parser.test.ts
git commit -m "test(phase-2): full v1 SDL construct coverage"
```

---

### Task 5: Round-trip test on memtree's full schema

**Files:**
- Create: `src/parser/__tests__/fixtures/memtree.esdl`
- Modify: `src/parser/__tests__/parser.test.ts`

- [ ] **Step 1: Create the fixture file**

```
// src/parser/__tests__/fixtures/memtree.esdl
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

- [ ] **Step 2: Add round-trip test**

```typescript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('memtree round-trip', () => {
  it('parses the full memtree schema without errors', () => {
    const source = readFileSync(join(__dirname, 'fixtures/memtree.esdl'), 'utf-8');
    const ast = parseSdl(source);

    expect(ast.enums).toHaveLength(3);
    expect(ast.enums.map(e => e.name)).toEqual(['NodeKind', 'NodeStatus', 'EdgeKind']);
    expect(ast.enums[0]!.values).toHaveLength(7); // NodeKind has 7 values

    expect(ast.types).toHaveLength(2);
    expect(ast.types.map(t => t.name)).toEqual(['Node', 'Edge']);

    const nodeType = ast.types.find(t => t.name === 'Node')!;
    expect(nodeType.indexes).toHaveLength(2);
    expect(nodeType.links).toHaveLength(1);

    const edgeType = ast.types.find(t => t.name === 'Edge')!;
    expect(edgeType.constraints).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/parser/__tests__/parser.test.ts
```

Expected: all pass including round-trip.

- [ ] **Step 4: Commit**

```bash
git add src/parser/__tests__/fixtures/memtree.esdl src/parser/__tests__/parser.test.ts
git commit -m "test(phase-2): memtree round-trip; Phase 2 deliverable complete"
```

---

### Phase 2 Deliverable Verification

- [ ] Run full test suite

```bash
pnpm test
```

Expected: all tests pass including the memtree round-trip.

- [ ] Confirm `parseSdl(source)` throws `EdgeLiteParseError` on malformed SDL and returns a valid `SdlAst` on memtree's schema.
