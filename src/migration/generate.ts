import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SchemaChange } from './diff.js';

const SEQ_PAD = 5;
const HASH_BYTES = 3;

export function generateMigrationFile(
  changes: SchemaChange[],
  migrationsDir: string,
  sequenceNumber: number,
): string {
  mkdirSync(migrationsDir, { recursive: true });

  const hasDestructive = changes.some((c) => c.destructive);
  const sqlLines: string[] = [];

  if (hasDestructive) {
    sqlLines.push(
      '-- DESTRUCTIVE',
      '-- This migration contains DROP TABLE or DROP COLUMN operations.',
      '-- Apply with: edgelite migration apply --allow-destructive',
      '',
    );
  }

  for (const change of changes) {
    sqlLines.push(changeToSql(change));
  }

  const seq = String(sequenceNumber).padStart(SEQ_PAD, '0');
  const hash = randomBytes(HASH_BYTES).toString('hex');
  const filename = `${seq}-${hash}.sql`;
  const filepath = path.join(migrationsDir, filename);

  const tmpPath = `${filepath}.tmp`;
  writeFileSync(tmpPath, sqlLines.join('\n'), 'utf8');
  renameSync(tmpPath, filepath);
  return filepath;
}

function changeToSql(change: SchemaChange): string {
  switch (change.kind) {
    case 'add_table': {
      return `CREATE TABLE ${change.tableName} (id TEXT PRIMARY KEY);`;
    }
    case 'drop_table': {
      return `DROP TABLE ${change.tableName};`;
    }
    case 'add_column': {
      return `ALTER TABLE ${change.tableName} ADD COLUMN ${change.columnName} TEXT;`;
    }
    case 'drop_column': {
      return `ALTER TABLE ${change.tableName} DROP COLUMN ${change.columnName};`;
    }
    default: {
      const _exhaustive: never = change;
      throw new Error(`changeToSql: unhandled change kind "${(_exhaustive as SchemaChange).kind}"`);
    }
  }
}
