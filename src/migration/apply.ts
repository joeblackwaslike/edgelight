import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

export interface ApplyOptions {
  allowDestructive?: boolean;
}

export async function applyMigrations(
  pglite: PGlite,
  migrationsDir: string,
  options: ApplyOptions = {},
): Promise<string[]> {
  const applied = await getAppliedMigrations(pglite);
  const files = getMigrationFiles(migrationsDir);
  // applied contains names WITHOUT .sql; files contain names WITH .sql — strip before comparing
  const pending = files.filter((f) => !applied.has(f.replace('.sql', '')));

  const appliedNames: string[] = [];

  for (const file of pending) {
    const content = readFileSync(path.join(migrationsDir, file), 'utf8');
    const isDestructive = content.startsWith('-- DESTRUCTIVE');

    if (isDestructive && !options.allowDestructive) {
      process.stderr.write(
        `[edgelite] Skipping DESTRUCTIVE migration: ${file}. Run with --allow-destructive to apply.\n`,
      );
      continue;
    }

    // Strip comment-only lines before executing SQL
    const sql = content.replaceAll(/^--[^\n]*\n/gm, '').trim();
    await pglite.exec(sql);
    await pglite.query('INSERT INTO _edgelite_migrations (name, applied_at) VALUES ($1, $2)', [
      file.replace('.sql', ''),
      Date.now(),
    ]);
    appliedNames.push(file);
  }

  return appliedNames;
}

export async function getAppliedMigrations(pglite: PGlite): Promise<Set<string>> {
  const result = await pglite.query<{ name: string }>(
    'SELECT name FROM _edgelite_migrations ORDER BY name',
  );
  return new Set(result.rows.map((r) => r.name));
}

export function getMigrationFiles(migrationsDir: string): string[] {
  try {
    return readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
