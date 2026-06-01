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

switch (command) {
  case 'codegen': {
    const source = readFileSync(schemaPath, 'utf8');
    const ast = parseSdl(source);
    const ts = generateQueryBuilder(ast);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, ts, 'utf8');
    console.log(`Generated ${outPath} from ${schemaPath}`);
    break;
  }

  case 'migration': {
    switch (subcommand) {
      case 'create': {
        const db = await openDb(dbPath, schemaPath);
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
        await closeDb(db);
        break;
      }

      case 'apply': {
        const db = await openDb(dbPath, schemaPath);
        const pglite = (db as unknown as InternalDb).pglite;
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
        const pglite = (db as unknown as InternalDb).pglite;
        const statuses = await getMigrationStatus(pglite, migrationsDir);
        for (const s of statuses) {
          let badge: string;
          if (s.status === 'applied') {
            badge = '✓';
          } else if (s.status === 'pending_destructive') {
            badge = '⚠ DESTRUCTIVE';
          } else {
            badge = '·';
          }
          console.log(`${badge} ${s.name}`);
        }
        await closeDb(db);
        break;
      }

      default: {
        process.stderr.write(
          'Usage: edgelite migration create|apply [--allow-destructive]|status [--db <path>]\n',
        );
        process.exit(1);
      }
    }
    break;
  }

  default: {
    process.stderr.write(`Unknown command: ${command ?? '(none)'}\n`);
    process.stderr.write(
      'Usage: edgelite codegen | migration <create|apply|status> [--db <path>]\n',
    );
    process.exit(1);
  }
}
