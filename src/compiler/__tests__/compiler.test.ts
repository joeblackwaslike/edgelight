import { describe, expect, it } from 'vitest';
import type { SdlAst } from '../../parser/ast.js';
import { compileSdl } from '../index.js';

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
