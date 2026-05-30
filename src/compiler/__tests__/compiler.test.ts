import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  ExclusiveConstraintNode,
  IndexNode,
  LinkNode,
  PropertyNode,
  SdlAst,
} from '../../parser/ast.js';
import { parseSdl } from '../../parser/index.js';
import { compileSdl } from '../index.js';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface AstOverrides {
  name?: string;
  properties?: PropertyNode[];
  links?: LinkNode[];
  indexes?: IndexNode[];
  constraints?: ExclusiveConstraintNode[];
}

function makeAst(overrides: AstOverrides = {}): SdlAst {
  return {
    enums: [],
    types: [
      {
        kind: 'object_type',
        name: overrides.name ?? 'Node',
        properties: overrides.properties ?? [],
        links: overrides.links ?? [],
        indexes: overrides.indexes ?? [],
        constraints: overrides.constraints ?? [],
      },
    ],
  };
}

function findTable(ast: SdlAst): string | undefined {
  return compileSdl(ast).find((s) => s.startsWith('CREATE TABLE'));
}

function compileType(props: PropertyNode[]): string | undefined {
  return findTable(makeAst({ properties: props }));
}

describe('compileSdl — CREATE TABLE', () => {
  it('emits CREATE TABLE for each ObjectType with id column', () => {
    const sql = compileSdl(makeAst());
    expect(sql.some((s) => s.includes('CREATE TABLE nodes'))).toBe(true);
    expect(sql.some((s) => s.includes('id TEXT PRIMARY KEY'))).toBe(true);
  });

  it('table name is pluralized lowercase', () => {
    const sql = compileSdl(makeAst({ name: 'Edge' }));
    expect(sql.some((s) => s.includes('CREATE TABLE edges'))).toBe(true);
  });
});

describe('compileSdl — property types', () => {
  it('str → TEXT NOT NULL (required)', () => {
    const sql = compileType([{ kind: 'property', name: 'content', type: 'str', required: true }]);
    expect(sql).toContain('content TEXT NOT NULL');
  });

  it('str → TEXT (optional)', () => {
    const sql = compileType([
      { kind: 'property', name: 'source_uri', type: 'str', required: false },
    ]);
    expect(sql).toContain('source_uri TEXT');
    expect(sql).not.toContain('NOT NULL');
  });

  it('int64 → BIGINT NOT NULL', () => {
    const sql = compileType([
      { kind: 'property', name: 'created_at', type: 'int64', required: true },
    ]);
    expect(sql).toContain('created_at BIGINT NOT NULL');
  });

  it('bool with default false', () => {
    const sql = compileType([
      { kind: 'property', name: 'truncated', type: 'bool', required: true, default: false },
    ]);
    expect(sql).toContain('truncated BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it('json with default {}', () => {
    const sql = compileType([
      { kind: 'property', name: 'metadata', type: 'json', required: false, default: '{}' },
    ]);
    expect(sql).toContain("metadata JSONB DEFAULT '{}'");
  });

  it('vector(1536) → vector(1536)', () => {
    const sql = compileType([
      {
        kind: 'property',
        name: 'embedding',
        type: { kind: 'vector', dimensions: 1536 },
        required: false,
      },
    ]);
    expect(sql).toContain('embedding vector(1536)');
  });

  it('str with empty string default', () => {
    const sql = compileType([
      { kind: 'property', name: 'content', type: 'str', required: true, default: '' },
    ]);
    expect(sql).toContain("content TEXT NOT NULL DEFAULT ''");
  });
});

describe('compileSdl — links', () => {
  it('link parent: Node → parent_id TEXT REFERENCES nodes(id)', () => {
    const ast = makeAst({
      links: [{ kind: 'link', name: 'parent', targetType: 'Node', required: false }],
    });
    const sql = findTable(ast);
    expect(sql).toContain('parent_id TEXT REFERENCES nodes(id)');
  });

  it('required link: src_id TEXT NOT NULL REFERENCES nodes(id)', () => {
    const ast = makeAst({
      name: 'Edge',
      links: [{ kind: 'link', name: 'src', targetType: 'Node', required: true }],
    });
    const sql = findTable(ast);
    expect(sql).toContain('src_id TEXT NOT NULL REFERENCES nodes(id)');
  });
});

describe('compileSdl — FTS index', () => {
  it('emits fts_vector TSVECTOR column, GIN index, and trigger', () => {
    const ast = makeAst({
      properties: [{ kind: 'property', name: 'content', type: 'str', required: true }],
      indexes: [{ kind: 'index_fts', property: 'content' }],
    });
    const statements = compileSdl(ast);
    const ftsCol = statements.find((s) => s.includes('fts_vector TSVECTOR'));
    const ginIndex = statements.find((s) => s.includes('USING GIN') && s.includes('fts_vector'));
    const trigger = statements.find((s) => s.includes('nodes_fts_trigger'));
    expect(ftsCol).toBeDefined();
    expect(ginIndex).toBeDefined();
    expect(trigger).toBeDefined();
  });
});

describe('compileSdl — exclusive constraint', () => {
  it('exclusive on (src, dst, kind) → UNIQUE(src_id, dst_id, kind)', () => {
    const ast = makeAst({
      name: 'Edge',
      links: [
        { kind: 'link', name: 'src', targetType: 'Node', required: true },
        { kind: 'link', name: 'dst', targetType: 'Node', required: true },
      ],
      constraints: [{ kind: 'constraint_exclusive', properties: ['src', 'dst', 'kind'] }],
    });
    const sql = findTable(ast);
    expect(sql).toContain('UNIQUE(src_id, dst_id, kind)');
  });
});

describe('compileSdl — full memtree schema', () => {
  it('compiles memtree schema to valid DDL without throwing', () => {
    const source = readFileSync(
      path.join(FIXTURE_DIR, '../../parser/__tests__/fixtures/memtree.esdl'),
      'utf8',
    );
    const ast = parseSdl(source);
    const statements = compileSdl(ast);

    expect(statements.some((s) => s.includes('CREATE TABLE nodes'))).toBe(true);
    expect(statements.some((s) => s.includes('CREATE TABLE edges'))).toBe(true);
    expect(statements.some((s) => s.includes('fts_vector TSVECTOR'))).toBe(true);
    expect(statements.some((s) => s.includes('UNIQUE(src_id, dst_id, kind)'))).toBe(true);
  });
});
