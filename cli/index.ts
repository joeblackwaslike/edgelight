#!/usr/bin/env node
/* eslint-disable import-x/no-relative-parent-imports */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateQueryBuilder } from '../src/codegen/index.js';
import { closeDb, openDb } from '../src/db.js';
import { applyMigrations, getMigrationFiles } from '../src/migration/apply.js';
import { diffSdlVsDb, introspectDb } from '../src/migration/diff.js';
import { generateMigrationFile } from '../src/migration/generate.js';
import { getMigrationStatus } from '../src/migration/status.js';
import { parseSdl } from '../src/parser/index.js';
import type { InternalDb } from '../src/types.js';

const [command, subcommand, ...flags] = process.argv.slice(2);

const dbFlagIndex = flags.indexOf('--db');
const dbPath =
  dbFlagIndex === -1
    ? (process.env.EDGELITE_DB ?? './edgelite-db')
    : (flags[dbFlagIndex + 1] ??
      (() => {
        process.stderr.write('--db requires a path argument\n');
        process.exit(1);
      })());

const schemaPath = 'dbschema/schema.esdl';
const migrationsDir = 'dbschema/migrations';
const outPath = 'dbschema/edgelite.ts';
const allowDestructive = flags.includes('--allow-destructive');

function runCodegen(): void {
  const source = readFileSync(schemaPath, 'utf8');
  const ast = parseSdl(source);
  const ts = generateQueryBuilder(ast);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, ts, 'utf8');
  console.log(`Generated ${outPath} from ${schemaPath}`);
}

async function runMigrationCreate(): Promise<void> {
  const db = await openDb(dbPath, schemaPath);
  try {
    const pglite = (db as unknown as InternalDb).pglite;
    const dbSchema = await introspectDb(pglite);
    const ast = parseSdl(readFileSync(schemaPath, 'utf8'));
    const changes = diffSdlVsDb(ast, dbSchema);
    if (changes.length === 0) {
      console.log('No schema changes detected.');
    } else {
      const seq = getMigrationFiles(migrationsDir).length + 1;
      const filepath = generateMigrationFile(changes, migrationsDir, seq);
      console.log(`✓ Created ${filepath}`);
    }
  } finally {
    await closeDb(db);
  }
}

async function runMigrationApply(): Promise<void> {
  const db = await openDb(dbPath, schemaPath);
  try {
    const pglite = (db as unknown as InternalDb).pglite;
    const applied = await applyMigrations(pglite, migrationsDir, { allowDestructive });
    if (applied.length === 0) {
      console.log('No migrations to apply.');
    } else {
      for (const name of applied) console.log(`✓ Applied ${name}`);
    }
  } finally {
    await closeDb(db);
  }
}

function statusBadge(status: 'applied' | 'pending' | 'pending_destructive'): string {
  if (status === 'applied') return '✓';
  if (status === 'pending_destructive') return '⚠ DESTRUCTIVE';
  return '·';
}

async function runMigrationStatus(): Promise<void> {
  const db = await openDb(dbPath, schemaPath);
  try {
    const pglite = (db as unknown as InternalDb).pglite;
    const statuses = await getMigrationStatus(pglite, migrationsDir);
    for (const s of statuses) {
      console.log(`${statusBadge(s.status)} ${s.name}`);
    }
  } finally {
    await closeDb(db);
  }
}

async function runMigration(): Promise<void> {
  switch (subcommand) {
    case 'create': {
      await runMigrationCreate();
      return;
    }
    case 'apply': {
      await runMigrationApply();
      return;
    }
    case 'status': {
      await runMigrationStatus();
      return;
    }
    default: {
      process.stderr.write(
        'Usage: edgelite migration create|apply [--allow-destructive]|status [--db <path>]\n',
      );
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  switch (command) {
    case 'codegen': {
      runCodegen();
      return;
    }
    case 'migration': {
      await runMigration();
      return;
    }
    default: {
      process.stderr.write(`Unknown command: ${command ?? '(none)'}\n`);
      process.stderr.write(
        'Usage: edgelite codegen | migration <create|apply|status> [--db <path>]\n',
      );
      process.exit(1);
    }
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- explicit catch needed for clean error reporting
main().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
