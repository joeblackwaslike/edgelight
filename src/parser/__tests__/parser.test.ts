import { describe, expect, it } from 'vitest';
import { EdgeLiteParseError } from '../../errors.js';
import { parseSdl } from '../index.js';

describe('parseSdl — basic', () => {
  it('parses a minimal enum', () => {
    const ast = parseSdl('scalar type NodeKind extending enum<session, file_chunk>;');
    expect(ast.enums).toHaveLength(1);
    expect(ast.enums[0]?.name).toBe('NodeKind');
    expect(ast.enums[0]?.values).toEqual(['session', 'file_chunk']);
  });

  it('throws EdgeLiteParseError on invalid SDL', () => {
    expect(() => parseSdl('not valid sdl !!!')).toThrow(EdgeLiteParseError);
  });
});

describe('parseSdl — ObjectType properties', () => {
  it('parses required and optional properties', () => {
    const ast = parseSdl(`
      type Node {
        required content: str;
        source_uri: str;
      }
    `);
    const node = ast.types[0];
    expect(node?.properties.find((p) => p.name === 'content')?.required).toBe(true);
    expect(node?.properties.find((p) => p.name === 'source_uri')?.required).toBe(false);
  });

  it('parses default values', () => {
    const ast = parseSdl(`
      type Node {
        required status: str { default := 'pending' };
        required mtime: int64 { default := 0 };
        required truncated: bool { default := false };
      }
    `);
    const node = ast.types[0];
    expect(node?.properties.find((p) => p.name === 'status')?.default).toBe('pending');
    expect(node?.properties.find((p) => p.name === 'mtime')?.default).toBe(0);
    expect(node?.properties.find((p) => p.name === 'truncated')?.default).toBe(false);
  });

  it('parses vector(N) property', () => {
    const ast = parseSdl(`
      type Node {
        embedding: vector(1536);
      }
    `);
    expect(ast.types[0]?.properties[0]?.type).toEqual({ kind: 'vector', dimensions: 1536 });
  });
});

describe('parseSdl — links, indexes, constraints', () => {
  it('parses a link', () => {
    const ast = parseSdl(`
      type Node {
        parent: Node;
      }
    `);
    const link = ast.types[0]?.links[0];
    expect(link?.name).toBe('parent');
    expect(link?.targetType).toBe('Node');
    expect(link?.required).toBe(false);
  });

  it('parses index fts', () => {
    const ast = parseSdl(`
      type Node {
        required content: str;
        index fts on (.content);
      }
    `);
    const index = ast.types[0]?.indexes[0];
    expect(index?.kind).toBe('index_fts');
    expect(index?.property).toBe('content');
  });

  it('parses index vec using ivfflat', () => {
    const ast = parseSdl(`
      type Node {
        embedding: vector(1536);
        index vec on (.embedding) using ivfflat;
      }
    `);
    const index = ast.types[0]?.indexes[0];
    expect(index?.kind).toBe('index_vec');
    if (index?.kind === 'index_vec') expect(index.using).toBe('ivfflat');
  });

  it('parses exclusive constraint', () => {
    const ast = parseSdl(`
      type Edge {
        required src: Node;
        required dst: Node;
        required kind: EdgeKind;
        constraint exclusive on ((.src, .dst, .kind));
      }
    `);
    const constraint = ast.types[0]?.constraints[0];
    expect(constraint?.kind).toBe('constraint_exclusive');
    expect(constraint?.properties).toEqual(['src', 'dst', 'kind']);
  });
});
