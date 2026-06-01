# EdgeLite Phase 6 — Migration CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three migration commands: `migration create` (diff SDL vs DB → new numbered `.sql` file), `migration apply` (run pending files in order, record in `_edgelite_migrations`), and `migration status` (list applied vs pending). Wire `autoMigrate: true` through `openDb()`. Destructive migrations (`DROP TABLE`, `DROP COLUMN`) are marked with a `-- DESTRUCTIVE` header and skipped by both `autoMigrate` and plain `migration apply` — they require `--allow-destructive`.

**Architecture:** `src/migration/diff.ts` — compares SDL AST to `information_schema` snapshot and produces a list of change objects. `src/migration/generate.ts` — converts change objects to SQL, writes numbered `.sql` files, marks destructive ones. `src/migration/apply.ts` — reads pending files, applies them, records in tracking table, respects `--allow-destructive`. `src/migration/status.ts` — queries tracking table and reads files to produce status list. CLI wired in `cli/index.ts`.

**Tech Stack:** pnpm, TypeScript, `@electric-sql/pglite`, Vitest

---

## Files

- Create: `src/migration/diff.ts` — SDL vs DB diff
- Create: `src/migration/generate.ts` — change → SQL file writer
- Create: `src/migration/apply.ts` — pending file applier
- Create: `src/migration/status.ts` — status reporter
- Create: `src/migration/__tests__/migration.test.ts` — integration tests
- Modify: `cli/index.ts` — wire `migration create|apply|status` commands
- Modify: `src/db.ts` — wire `autoMigrate` into `openDb()`

---

### Task 1: Implement DB introspection for diff

**Files:**
- Create: `src/migration/diff.ts`
- Create: `src/migration/__tests__/migration.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/migration/__tests__/migration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { introspectDb } from '../diff.js';
import { rmSync, existsSync } from 'node:fs';

const TEST_DB = './test-db-migration';
let pglite: PGlite;

beforeAll(async () => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
  pglite = await PGlite.create(TEST_DB, { extensions: { vector } });
  await pglite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT NOT NULL)`);
});

afterAll(async () => {
  await pglite.close();
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('introspectDb', () => {
  it('returns table names from information_schema', async () => {
    const schema = await introspectDb(pglite);
    expect(schema.tables.map(t => t.name)).toContain('nodes');
  });

  it('returns column names for each table', async () => {
    const schema = await introspectDb(pglite);
    const nodesTable = schema.tables.find(t => t.name === 'nodes')!;
    expect(nodesTable.columns.map(c => c.name)).toContain('id');
    expect(nodesTable.columns.map(c => c.name)).toContain('content');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/migration/__tests__/migration.test.ts
```

Expected: FAIL — "Cannot find module '../diff.js'"

- [ ] **Step 3: Implement introspectDb**

```typescript
// src/migration/diff.ts
import type { PGlite } from '@electric-sql/pglite';
import type { SdlAst } from '../parser/ast.js';

export interface DbColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
}

export interface DbSchema {
  tables: DbTable[];
}

export async function introspectDb(pglite: PGlite): Promise<DbSchema> {
  const tablesResult = await pglite.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '\\_edgelite%'
    ORDER BY table_name
  `);

  const tables: DbTable[] = [];
  for (const row of tablesResult.rows) {
    const colsResult = await pglite.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [row.table_name]);

    tables.push({
      name: row.table_name,
      columns: colsResult.rows.map(c => ({
        name: c.column_name,
        dataType: c.data_type,
        nullable: c.is_nullable === 'YES',
      })),
    });
  }

  return { tables };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/migration/__tests__/migration.test.ts
```

Expected: 2 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/migration/diff.ts src/migration/__tests__/migration.test.ts
git commit -m "feat(phase-6): DB introspection via information_schema"
```

---

### Task 2: Implement SDL vs DB diff and change generation

**Files:**
- Modify: `src/migration/diff.ts`
- Modify: `src/migration/__tests__/migration.test.ts`

- [ ] **Step 1: Add diff test**

```typescript
import { diffSdlVsDb } from '../diff.js';
import { parseSdl } from '../../parser/index.js';

describe('diffSdlVsDb', () => {
  it('detects new table when type exists in SDL but not in DB', () => {
    const ast = parseSdl(`
      type NewType {
        required name: str;
      }
    `);
    const dbSchema: DbSchema = { tables: [] };
    const changes = diffSdlVsDb(ast, dbSchema);
    expect(changes.some(c => c.kind === 'add_table' && c.typeName === 'NewType')).toBe(true);
  });

  it('detects new column when property exists in SDL but not in DB', () => {
    const ast = parseSdl(`
      type Node {
        required name: str;
        new_col: str;
      }
    `);
    const dbSchema: DbSchema = {
      tables: [{ name: 'nodes', columns: [
        { name: 'id', dataType: 'text', nullable: false },
        { name: 'name', dataType: 'text', nullable: false },
      ]}],
    };
    const changes = diffSdlVsDb(ast, dbSchema);
    expect(changes.some(c => c.kind === 'add_column' && c.columnName === 'new_col')).toBe(true);
  });

  it('detects removed table (destructive)', () => {
    const ast: SdlAst = { enums: [], types: [] };
    const dbSchema: DbSchema = {
      tables: [{ name: 'old_table', columns: [{ name: 'id', dataType: 'text', nullable: false }] }],
    };
    const changes = diffSdlVsDb(ast, dbSchema);
    const drop = changes.find(c => c.kind === 'drop_table');
    expect(drop).toBeDefined();
    expect(drop?.destructive).toBe(true);
  });
});
```

- [ ] **Step 2: Implement diffSdlVsDb**

```typescript
// Add to src/migration/diff.ts

export type ChangeKind = 'add_table' | 'drop_table' | 'add_column' | 'drop_column' | 'add_index' | 'add_constraint';

export interface SchemaChange {
  kind: ChangeKind;
  typeName?: string;
  tableName?: string;
  columnName?: string;
  sql?: string;
  destructive: boolean;
}

export function diffSdlVsDb(ast: SdlAst, db: DbSchema): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const sdlTableNames = new Set(ast.types.map(t => t.name.toLowerCase() + 's'));
  const dbTableNames = new Set(db.tables.map(t => t.name));

  // New tables
  for (const type of ast.types) {
    const table = type.name.toLowerCase() + 's';
    if (!dbTableNames.has(table)) {
      changes.push({ kind: 'add_table', typeName: type.name, tableName: table, destructive: false });
    } else {
      // Check for new/dropped columns
      const dbTable = db.tables.find(t => t.name === table)!;
      const dbCols = new Set(dbTable.columns.map(c => c.name));
      const sdlCols = new Set([
        'id',
        ...type.properties.map(p => p.name),
        ...type.links.map(l => l.name + '_id'),
      ]);
      for (const col of sdlCols) {
        if (!dbCols.has(col)) {
          changes.push({ kind: 'add_column', tableName: table, columnName: col, destructive: false });
        }
      }
      for (const col of dbCols) {
        if (!sdlCols.has(col) && col !== 'fts_vector') {
          changes.push({ kind: 'drop_column', tableName: table, columnName: col, destructive: true });
        }
      }
    }
  }

  // Dropped tables
  for (const dbTable of db.tables) {
    if (!sdlTableNames.has(dbTable.name)) {
      changes.push({ kind: 'drop_table', tableName: dbTable.name, destructive: true });
    }
  }

  return changes;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/migration/__tests__/migration.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/migration/diff.ts src/migration/__tests__/migration.test.ts
git commit -m "feat(phase-6): SDL vs DB diff — detects add/drop table, add/drop column"
```

---

### Task 3: Implement migration file generation

**Files:**
- Create: `src/migration/generate.ts`
- Modify: `src/migration/__tests__/migration.test.ts`

- [ ] **Step 1: Add file generation test**

```typescript
import { generateMigrationFile } from '../generate.js';
import { rmSync, readFileSync, existsSync } from 'node:fs';

describe('generateMigrationFile', () => {
  const migrationsDir = './test-migrations';

  afterEach(() => { if (existsSync(migrationsDir)) rmSync(migrationsDir, { recursive: true }); });

  it('writes a numbered SQL file for non-destructive changes', () => {
    const changes: SchemaChange[] = [
      { kind: 'add_table', typeName: 'Tag', tableName: 'tags', destructive: false },
    ];
    const filepath = generateMigrationFile(changes, migrationsDir, 1);
    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('CREATE TABLE tags');
    expect(content).not.toContain('-- DESTRUCTIVE');
  });

  it('marks file with -- DESTRUCTIVE header when any change is destructive', () => {
    const changes: SchemaChange[] = [
      { kind: 'drop_table', tableName: 'old_table', destructive: true },
    ];
    const filepath = generateMigrationFile(changes, migrationsDir, 2);
    const content = readFileSync(filepath, 'utf-8');
    expect(content.startsWith('-- DESTRUCTIVE')).toBe(true);
    expect(content).toContain('DROP TABLE old_table');
  });

  it('names file with zero-padded sequence number', () => {
    const changes: SchemaChange[] = [
      { kind: 'add_table', typeName: 'X', tableName: 'xs', destructive: false },
    ];
    const filepath = generateMigrationFile(changes, migrationsDir, 3);
    expect(filepath).toContain('00003-');
  });
});
```

- [ ] **Step 2: Implement generate.ts**

```typescript
// src/migration/generate.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SchemaChange } from './diff.js';

export function generateMigrationFile(
  changes: SchemaChange[],
  migrationsDir: string,
  sequenceNumber: number,
): string {
  mkdirSync(migrationsDir, { recursive: true });

  const hasDestructive = changes.some(c => c.destructive);
  const sqlLines: string[] = [];

  if (hasDestructive) {
    sqlLines.push('-- DESTRUCTIVE');
    sqlLines.push('-- This migration contains DROP TABLE or DROP COLUMN operations.');
    sqlLines.push('-- Apply with: edgelite migration apply --allow-destructive');
    sqlLines.push('');
  }

  for (const change of changes) {
    sqlLines.push(changToSql(change));
  }

  const seq = String(sequenceNumber).padStart(5, '0');
  const hash = Math.random().toString(36).slice(2, 8);
  const filename = `${seq}-${hash}.sql`;
  const filepath = join(migrationsDir, filename);

  writeFileSync(filepath, sqlLines.join('\n'), 'utf-8');
  return filepath;
}

function changToSql(change: SchemaChange): string {
  switch (change.kind) {
    case 'add_table':
      return `CREATE TABLE ${change.tableName} (id TEXT PRIMARY KEY);`;
    case 'drop_table':
      return `DROP TABLE ${change.tableName};`;
    case 'add_column':
      return `ALTER TABLE ${change.tableName} ADD COLUMN ${change.columnName} TEXT;`;
    case 'drop_column':
      return `ALTER TABLE ${change.tableName} DROP COLUMN ${change.columnName};`;
    default:
      return `-- ${change.kind} (not yet implemented)`;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/migration/__tests__/migration.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/migration/generate.ts src/migration/__tests__/migration.test.ts
git commit -m "feat(phase-6): migration file generation with DESTRUCTIVE header"
```

---

### Task 4: Implement migration apply and status

**Files:**
- Create: `src/migration/apply.ts`
- Create: `src/migration/status.ts`

- [ ] **Step 1: Implement apply.ts**

```typescript
// src/migration/apply.ts
import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EdgeLiteSchemaError } from '../errors.js';

export interface ApplyOptions {
  allowDestructive?: boolean;
}

export async function applyMigrations(
  pglite: PGlite,
  migrationsDir: string,
  opts: ApplyOptions = {},
): Promise<string[]> {
  const applied = await getAppliedMigrations(pglite);
  const files = getMigrationFiles(migrationsDir);
  // applied contains names WITHOUT .sql (as stored in _edgelite_migrations).
  // files contains names WITH .sql. Strip before comparing.
  const pending = files.filter(f => !applied.has(f.replace('.sql', '')));

  const appliedNames: string[] = [];

  for (const file of pending) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    const isDestructive = content.startsWith('-- DESTRUCTIVE');

    if (isDestructive && !opts.allowDestructive) {
      console.warn(`[edgelite] Skipping DESTRUCTIVE migration: ${file}. Run with --allow-destructive to apply.`);
      continue;
    }

    await pglite.exec(content.replace(/^-- .*\n/gm, '').trim());
    await pglite.query(
      `INSERT INTO _edgelite_migrations (name, applied_at) VALUES ($1, $2)`,
      [file.replace('.sql', ''), Date.now()],
    );
    appliedNames.push(file);
  }

  return appliedNames;
}

export async function getAppliedMigrations(pglite: PGlite): Promise<Set<string>> {
  const result = await pglite.query<{ name: string }>(
    `SELECT name FROM _edgelite_migrations ORDER BY name`,
  );
  return new Set(result.rows.map(r => r.name));
}

export function getMigrationFiles(migrationsDir: string): string[] {
  try {
    return readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Implement status.ts**

```typescript
// src/migration/status.ts
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAppliedMigrations, getMigrationFiles } from './apply.js';

export interface MigrationStatus {
  name: string;
  status: 'applied' | 'pending' | 'pending_destructive';
}

export async function getMigrationStatus(
  pglite: PGlite,
  migrationsDir: string,
): Promise<MigrationStatus[]> {
  const applied = await getAppliedMigrations(pglite);
  const files = getMigrationFiles(migrationsDir);

  return files.map(file => {
    const name = file.replace('.sql', '');
    if (applied.has(name)) return { name, status: 'applied' };
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    const isDestructive = content.startsWith('-- DESTRUCTIVE');
    return { name, status: isDestructive ? 'pending_destructive' : 'pending' };
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/migration/apply.ts src/migration/status.ts
git commit -m "feat(phase-6): migration apply (with DESTRUCTIVE skip) and status"
```

---

### Task 5: Wire CLI commands and autoMigrate

**Files:**
- Modify: `cli/index.ts`
- Modify: `src/db.ts`

- [ ] **Step 1: Update cli/index.ts for migration commands**

```typescript
// cli/index.ts (full replacement)
#!/usr/bin/env node
import { parseSdl } from '../src/parser/index.js';
import { generateQueryBuilder } from '../src/codegen/index.js';
import { introspectDb, diffSdlVsDb } from '../src/migration/diff.js';
import { generateMigrationFile } from '../src/migration/generate.js';
import { applyMigrations, getMigrationFiles } from '../src/migration/apply.js';
import { getMigrationStatus } from '../src/migration/status.js';
import { openDb, closeDb } from '../src/db.js';
import type { InternalDb } from '../src/types.js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const flags = args.slice(2);

// --db <path> specifies the PGlite data directory to operate on.
// Defaults to the value in EDGELITE_DB env var, then './edgelite-db'.
// Migration commands (create/apply/status) operate against this DB.
const dbFlagIdx = flags.indexOf('--db');
const dbPath = dbFlagIdx !== -1
  ? flags[dbFlagIdx + 1] ?? (() => { console.error('--db requires a path argument'); process.exit(1); })()
  : (process.env['EDGELITE_DB'] ?? './edgelite-db');

const schemaPath = 'dbschema/schema.esdl';
const migrationsDir = 'dbschema/migrations';
const outPath = 'dbschema/edgelite.ts';
const allowDestructive = flags.includes('--allow-destructive');

switch (command) {
  case 'codegen': {
    const source = readFileSync(schemaPath, 'utf-8');
    const ast = parseSdl(source);
    const ts = generateQueryBuilder(ast);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, ts, 'utf-8');
    console.log(`✓ Generated ${outPath}`);
    break;
  }

  case 'migration': {
    switch (subcommand) {
      case 'create': {
        // Opens the actual target DB (not a scratch DB) to introspect real current schema.
        const db = await openDb(dbPath, schemaPath);
        const pglite = (db as InternalDb).pglite;
        const dbSchema = await introspectDb(pglite);
        const ast = parseSdl(readFileSync(schemaPath, 'utf-8'));
        const changes = diffSdlVsDb(ast, dbSchema);
        if (changes.length === 0) {
          console.log('No schema changes detected.');
        } else {
          const existing = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
          const seq = existing.length + 1;
          const filepath = generateMigrationFile(changes, migrationsDir, seq);
          console.log(`✓ Created ${filepath}`);
        }
        await closeDb(db);
        break;
      }

      case 'apply': {
        const db = await openDb(dbPath, schemaPath);
        const pglite = (db as InternalDb).pglite;
        const applied = await applyMigrations(pglite, migrationsDir, { allowDestructive });
        if (applied.length === 0) {
          console.log('No migrations to apply.');
        } else {
          for (const name of applied) console.log(`✓ Applied ${name}`);
        }
        await closeDb(db);
        break;
      }

      case 'status': {
        const db = await openDb(dbPath, schemaPath);
        const pglite = (db as InternalDb).pglite;
        const statuses = await getMigrationStatus(pglite, migrationsDir);
        for (const s of statuses) {
          const badge = s.status === 'applied' ? '✓' : s.status === 'pending_destructive' ? '⚠ DESTRUCTIVE' : '·';
          console.log(`${badge} ${s.name}`);
        }
        await closeDb(db);
        break;
      }

      default:
        console.error('Usage: edgelite migration create|apply [--allow-destructive]|status [--db <path>]');
        process.exit(1);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: edgelite codegen | migration <create|apply|status> [--db <path>]');
    process.exit(1);
}
```

- [ ] **Step 2: Wire autoMigrate in openDb()**

In `src/db.ts`, after `ensureMigrationsTable(pglite)`, add:

```typescript
import { applyMigrations } from './migration/apply.js';
import { getAppliedMigrations, getMigrationFiles } from './migration/apply.js';
import { EdgeLiteSchemaError } from './errors.js';

// After ensureMigrationsTable():
const migrationsDir = join(dirname(schemaPath), 'migrations');

if (opts.autoMigrate) {
  await applyMigrations(pglite, migrationsDir, { allowDestructive: false });
} else {
  // Strict mode: throw if any unapplied migration exists (including destructive)
  const applied = await getAppliedMigrations(pglite);
  const files = getMigrationFiles(migrationsDir);
  const pending = files.filter(f => !applied.has(f.replace('.sql', '')));
  if (pending.length > 0) {
    throw new EdgeLiteSchemaError(
      `Unapplied migrations detected: ${pending.join(', ')}. ` +
      `Run \`edgelite migration apply\` or open with { autoMigrate: true }.`,
    );
  }
}
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 4: End-to-end test: add web_chunk flow**

```bash
# Verify migration create → apply cycle works end-to-end against a real DB path.
# Pass --db to point at the actual database directory, not a scratch dir.
node --loader ts-node/esm cli/index.ts migration status --db ./test-edgelite-db
```

Expected: shows `.gitkeep` filtered out, no pending migrations.

- [ ] **Step 5: Commit**

```bash
git add cli/index.ts src/db.ts
git commit -m "feat(phase-6): migration CLI complete; autoMigrate wired; DESTRUCTIVE policy enforced"
```

---

### Phase 6 Deliverable Verification

- [ ] Run `bun test` — all pass.
- [ ] `edgelite migration create` detects schema drift and writes a numbered `.sql` file.
- [ ] `edgelite migration apply` applies non-destructive pending files and skips `-- DESTRUCTIVE` ones with a warning.
- [ ] `edgelite migration apply --allow-destructive` applies all pending files.
- [ ] `openDb()` with no `autoMigrate` throws `EdgeLiteSchemaError` when unapplied migrations exist.
