import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
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

  return files.map((file) => {
    const name = file.replace('.sql', '');
    if (applied.has(name)) return { name, status: 'applied' };
    const content = readFileSync(path.join(migrationsDir, file), 'utf8');
    const isDestructive = content.startsWith('-- DESTRUCTIVE');
    return { name, status: isDestructive ? 'pending_destructive' : 'pending' };
  });
}
