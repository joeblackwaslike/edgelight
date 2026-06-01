# EdgeLite Phase 0 — Repo Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the existing `edgelight` repo scaffold to serve as the `edgelite` package foundation — correct the npm package name, add the PGlite dependency, create the `src/` module directories, add the `cli/` entry point, and update `.gitignore` — so every subsequent phase has a clean, consistent foundation to build on.

**Key constraint:** The existing repo already has pnpm, Vitest, Biome, ESLint, Docusaurus, Husky, and a CI workflow for Node 20/22. Do NOT replace this toolchain. Adapt it.

**Architecture:** Monorepo-style single package with two entry points: `index.ts` (runtime library) and `cli/index.ts` (CLI tool). Source lives in `src/` split by module boundary. Generated output lives in `dbschema/` and is git-ignored except for `migrations/`.

**Tech Stack:** pnpm, TypeScript 5.x, Vitest, Biome, ESLint, GitHub Actions (existing CI)

---

## Files

- **Modify:** `package.json` — rename to `edgelite`, add PGlite dep, add bin + codegen export
- **Modify:** `tsconfig.json` — ensure `cli/**/*` is included in compilation
- **Modify:** `.gitignore` — add PGlite data dirs and generated query builder
- **Modify:** `src/index.ts` — replace placeholder with error-type re-export stub
- **Create:** `cli/index.ts` — CLI entry stub
- **Create:** `dbschema/migrations/.gitkeep`
- **Create:** `src/__tests__/smoke.test.ts` — smoke test to verify build + test pipeline

---

### Task 1: Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current package.json**

```bash
cat package.json
```

Confirm the file exists (it does — the repo is already scaffolded).

- [ ] **Step 2: Apply targeted edits**

Change `"name"` from `"edgelight"` to `"edgelite"`. Add `"bin"` and `"./codegen"` export. Add PGlite to `"dependencies"`. The rest of the file (scripts, devDependencies, lint-staged, pnpm config) stays unchanged.

Specific changes:

```diff
-  "name": "edgelight",
+  "name": "edgelite",
```

```diff
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "types": "./dist/index.d.ts"
-    }
+    },
+    "./codegen": {
+      "import": "./dist/codegen/builders.js",
+      "types": "./dist/codegen/builders.d.ts"
+    }
   },
```

Add after `"exports"`:
```json
  "bin": {
    "edgelite": "./cli/index.ts"
  },
```

Add to `"dependencies"` (create if absent):
```json
  "dependencies": {
    "@electric-sql/pglite": "^0.2.0"
  },
```

- [ ] **Step 3: Install new dependency**

```bash
pnpm install
```

Expected: `@electric-sql/pglite` added to `node_modules/`, lockfile updated.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(phase-0): rename package to edgelite, add PGlite dep, add CLI bin + codegen export"
```

---

### Task 2: Update tsconfig.json

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Read current tsconfig.json**

```bash
cat tsconfig.json
```

- [ ] **Step 2: Ensure cli/** is included**

The existing tsconfig's `include` array must cover `cli/**/*`. If it already includes `"**/*"` or similar, no change needed. Otherwise add:

```diff
-  "include": ["src/**/*", "index.ts"],
+  "include": ["src/**/*", "cli/**/*", "index.ts"],
```

Also ensure `"exclude"` contains:
```json
"exclude": ["node_modules", "dist", "dbschema/edgelite.ts"]
```

- [ ] **Step 3: Typecheck on empty project**

```bash
pnpm typecheck
```

Expected: exits 0, or only errors about files that don't exist yet (acceptable at this stage).

---

### Task 3: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add PGlite data directories and generated query builder**

Append to the existing `.gitignore`:

```
# PGlite data directories (never commit runtime data)
*-db/

# Generated query builder — rebuilt from schema.esdl via `edgelite codegen`
dbschema/edgelite.ts
```

- [ ] **Step 2: Verify existing entries are preserved**

```bash
head -20 .gitignore
```

The existing entries (`node_modules/`, `dist/`, etc.) must still be present.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(phase-0): gitignore PGlite data dirs and generated query builder"
```

---

### Task 4: Create directory structure

**Files:**
- Modify: `src/index.ts`
- Create: `cli/index.ts`
- Create: `dbschema/migrations/.gitkeep`
- Create subdirectories under `src/`

- [ ] **Step 1: Create src module directories**

```bash
mkdir -p src/parser src/compiler src/codegen src/runtime src/migration src/__tests__
mkdir -p cli
mkdir -p dbschema/migrations
touch dbschema/migrations/.gitkeep
```

- [ ] **Step 2: Update src/index.ts**

Replace whatever placeholder is in `src/index.ts` with the error-type re-export stub:

```typescript
// Public re-exports — populated as phases are implemented
export type { Db, DbOptions } from './types.js';
export { openDb, closeDb } from './db.js';
export {
  EdgeLiteParseError,
  EdgeLiteCompileError,
  EdgeLiteRuntimeError,
  EdgeLiteSchemaError,
  EdgeLiteConcurrencyError,
} from './errors.js';
```

- [ ] **Step 3: Create cli/index.ts stub**

```typescript
#!/usr/bin/env node
// EdgeLite CLI — commands: codegen | migration create | migration apply | migration status
const [, , command] = process.argv;

switch (command) {
  case 'codegen':
  case 'migration':
    console.error(`Command '${command}' not yet implemented`);
    process.exit(1);
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: edgelite codegen | migration <create|apply|status>');
    process.exit(1);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts cli/index.ts dbschema/migrations/.gitkeep
git commit -m "chore(phase-0): create module directory structure, CLI stub"
```

---

### Task 5: Verify existing CI is compatible

**Files:**
- Read-only: `.github/workflows/ci.yml`

- [ ] **Step 1: Read existing CI config**

```bash
cat .github/workflows/ci.yml
```

- [ ] **Step 2: Confirm CI runs pnpm + typecheck + test**

The existing CI runs on Node 20/22 with pnpm. That is correct for this project. No changes needed.

If the CI does NOT run `pnpm typecheck` and `pnpm test`, add those steps. Otherwise proceed.

- [ ] **Step 3: No commit needed if CI is already correct**

---

### Task 6: Smoke test + verify pipeline

**Files:**
- Create: `src/__tests__/smoke.test.ts`

- [ ] **Step 1: Write smoke test**

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: at least the smoke test passes. Other test failures about missing modules are acceptable at this stage.

- [ ] **Step 3: Verify build passes**

```bash
pnpm build
```

Expected: exits 0. (Will warn about missing source imports until later phases fill in `src/db.ts`, `src/errors.ts` etc. — acceptable at this stage.)

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/smoke.test.ts
git commit -m "chore(phase-0): add smoke test; Phase 0 scaffold complete"
```

---

### Phase 0 Deliverable Verification

- [ ] `pnpm test` — smoke test passes.
- [ ] `pnpm typecheck` — exits 0 (or only errors about not-yet-created source files).
- [ ] `pnpm build` — exits 0.
- [ ] `package.json` has `"name": "edgelite"`, `"bin": { "edgelite": ... }`, `./codegen` export, `@electric-sql/pglite` in dependencies.
- [ ] `dbschema/migrations/` directory exists with `.gitkeep`.
- [ ] `cli/index.ts` exists.
