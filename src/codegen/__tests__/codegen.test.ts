import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSdl } from '../../parser/index.js';
import { generateQueryBuilder } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memtreeSchema = readFileSync(
  path.join(__dirname, '../../parser/__tests__/fixtures/memtree.esdl'),
  'utf8',
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
    expect(src).toContain('session:');
    expect(src).toContain('web_chunk:');
  });

  it('includes select, insert, update, count, op, all, any, neighbors, fts', () => {
    const src = generateQueryBuilder(parseSdl(memtreeSchema));
    for (const fn of [
      'select',
      'insert',
      'update',
      'count',
      'op',
      'all',
      'any',
      'neighbors',
      'fts',
    ]) {
      expect(src).toContain(`  ${fn}`);
    }
  });

  it('InsertBuilder has unlessConflict method', () => {
    const src = generateQueryBuilder(parseSdl(memtreeSchema));
    expect(src).toContain('unlessConflict');
  });
});
