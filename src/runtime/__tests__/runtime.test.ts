import { describe, expect, it } from 'vitest';
import type { FieldRef, SelectBuilder } from '../../codegen/builders.js';
import { compileQuery } from '../compile.js';

function field(table: string, column: string): FieldRef {
  return { kind: 'field', table, column };
}

describe('compileQuery — SELECT', () => {
  it('compiles basic select with filter', () => {
    const query: SelectBuilder<unknown> = {
      kind: 'select',
      table: 'nodes',
      shape: { id: true, content: true, status: true },
      filter: { kind: 'op', left: field('nodes', 'status'), operator: '=', right: 'live' },
      _type: undefined,
    };
    const { sql, params } = compileQuery(query);
    expect(sql).toContain('SELECT');
    expect(sql).toContain('n.id');
    expect(sql).toContain('n.content');
    expect(sql).toContain('WHERE n.status = $1');
    expect(params).toEqual(['live']);
  });

  it('compiles select with ORDER BY and LIMIT', () => {
    const query: SelectBuilder<unknown> = {
      kind: 'select',
      table: 'nodes',
      shape: { id: true },
      orderBy: { expr: field('nodes', 'created_at'), dir: 'DESC' },
      limit: 10,
      _type: undefined,
    };
    const { sql } = compileQuery(query);
    expect(sql).toContain('ORDER BY n.created_at DESC');
    expect(sql).toContain('LIMIT $1');
  });

  it('compiles one-level link traversal', () => {
    const query: SelectBuilder<unknown> = {
      kind: 'select',
      table: 'nodes',
      shape: { id: true, parent: { id: true } },
      _type: undefined,
    };
    const { sql } = compileQuery(query);
    expect(sql).toContain('LEFT JOIN nodes p ON p.id = n.parent_id');
    expect(sql).toContain('p.id AS parent__id');
  });
});
