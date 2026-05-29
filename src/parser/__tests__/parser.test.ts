import { describe, expect, it } from 'vitest';
import { EdgeLiteParseError } from '../../errors.js';
import { parseSdl } from '../index.js';

describe('parseSdl', () => {
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
