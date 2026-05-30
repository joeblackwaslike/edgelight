import { describe, expect, it } from 'vitest';
import type { PropertyNode, SdlAst } from '../../parser/ast.js';
import { compileSdl } from '../index.js';

function compileType(props: PropertyNode[]): string | undefined {
  return compileSdl({
    enums: [],
    types: [
      {
        kind: 'object_type',
        name: 'Node',
        properties: props,
        links: [],
        indexes: [],
        constraints: [],
      },
    ],
  }).find((s) => s.includes('CREATE TABLE'));
}

describe('compileSdl — CREATE TABLE', () => {
  it('emits CREATE TABLE for each ObjectType with id column', () => {
    const ast: SdlAst = {
      enums: [],
      types: [
        {
          kind: 'object_type',
          name: 'Node',
          properties: [],
          links: [],
          indexes: [],
          constraints: [],
        },
      ],
    };
    const sql = compileSdl(ast);
    expect(sql.some((s) => s.includes('CREATE TABLE nodes'))).toBe(true);
    expect(sql.some((s) => s.includes('id TEXT PRIMARY KEY'))).toBe(true);
  });

  it('table name is pluralized lowercase', () => {
    const ast: SdlAst = {
      enums: [],
      types: [
        {
          kind: 'object_type',
          name: 'Edge',
          properties: [],
          links: [],
          indexes: [],
          constraints: [],
        },
      ],
    };
    const sql = compileSdl(ast);
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
