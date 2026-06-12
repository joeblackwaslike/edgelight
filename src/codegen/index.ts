/* eslint-disable import-x/no-relative-parent-imports */
import type { ObjectTypeNode, ScalarEnumNode, SdlAst } from '../parser/ast.js';

const REF_LINE = '    const ref = makeRef(typeHandle._table, typeHandle._links);';

export function generateQueryBuilder(ast: SdlAst): string {
  const lines: string[] = [
    '// GENERATED — do not edit. Regenerate with: edgelite codegen',
    '// This file is gitignored. Import it via a relative path from the consuming project root.',
    `import type { Query, SelectBuilder, InsertBuilder, UpdateBuilder, CountBuilder, NeighborsBuilder, FtsBuilder, FilterExpr, FieldRef, OrderByClause, OpExpr, AllExpr, AnyExpr } from 'edgelite/codegen';`,
    '',
  ];

  for (const en of ast.enums) {
    lines.push(...generateEnumConst(en));
  }

  for (const type of ast.types) {
    lines.push(...generateTypeHandle(type));
  }

  lines.push('const e = {');
  for (const type of ast.types) {
    lines.push(`  ${type.name}: ${type.name},`);
  }
  for (const en of ast.enums) {
    lines.push(`  ${en.name},`);
  }
  lines.push(
    '  select<T>(typeHandle: TypeHandle, shape: (ref: any) => any): SelectBuilder<T> {',
    REF_LINE,
    '    const resolved = shape(ref);',
    '    const { filter, orderBy, limit, ...fields } = resolved;',
    `    return { kind: 'select', table: typeHandle._table, shape: fields, filter, orderBy, limit } as SelectBuilder<T>;`,
    '  },',
    '  insert<T>(typeHandle: TypeHandle, data: Record<string, unknown>): InsertBuilder<T> {',
    '    const builder: InsertBuilder<T> = {',
    `      kind: 'insert', table: typeHandle._table, _links: typeHandle._links, data,`,
    '      _type: undefined as unknown as T,',
    `      unlessConflict() { return { ...this, onConflict: 'ignore' }; },`,
    '    };',
    '    return builder;',
    '  },',
    '  update<T>(typeHandle: TypeHandle, fn: (ref: any) => { filter: FilterExpr; set: Record<string, unknown> }): UpdateBuilder<T> {',
    REF_LINE,
    '    const { filter, set } = fn(ref);',
    `    return { kind: 'update', table: typeHandle._table, filter, set } as UpdateBuilder<T>;`,
    '  },',
    '  count(typeHandle: TypeHandle, fn?: (ref: any) => { filter?: FilterExpr }): CountBuilder {',
    REF_LINE,
    '    const filter = fn ? fn(ref).filter : undefined;',
    `    return { kind: 'count', table: typeHandle._table, filter };`,
    '  },',
    `  op(left: FieldRef, operator: OpExpr['operator'], right: unknown): OpExpr {`,
    `    return { kind: 'op', left, operator, right };`,
    '  },',
    `  all(...exprs: FilterExpr[]): AllExpr { return { kind: 'all', exprs }; },`,
    `  any(...exprs: FilterExpr[]): AnyExpr { return { kind: 'any', exprs }; },`,
    '  neighbors<T>(nodeId: string, opts: { edgeKinds: string[] }): NeighborsBuilder<T> {',
    `    return { kind: 'neighbors', nodeId, edgeKinds: opts.edgeKinds } as NeighborsBuilder<T>;`,
    '  },',
    '  fts<T>(typeHandle: TypeHandle, query: string): FtsBuilder<T> {',
    `    return { kind: 'fts', table: typeHandle._table, query } as FtsBuilder<T>;`,
    '  },',
    '};',
    '',
    'export default e;',
    '',
    '// ── Internal helpers ────────────────────────────────────────────────',
    'interface TypeHandle { _table: string; _links: readonly string[]; }',
    'function makeRef(table: string, links: readonly string[]): Record<string, FieldRef> {',
    '  const linkSet = new Set(links);',
    '  return new Proxy({} as Record<string, FieldRef>, {',
    '    // Link fields resolve to the FK column name (e.g. parent → parent_id).',
    '    get(_, prop: string) {',
    '      const column = linkSet.has(prop) ? `${prop}_id` : prop;',
    `      return { kind: 'field', table, column };`,
    '    },',
    '  });',
    '}',
  );

  return lines.join('\n');
}

function generateEnumConst(en: ScalarEnumNode): string[] {
  const entries = en.values.map((v) => `  ${v}: '${v}' as const`).join(',\n');
  return [`const ${en.name} = {`, entries, '};', ''];
}

function generateTypeHandle(type: ObjectTypeNode): string[] {
  const links = type.links.map((l) => `'${l.name}'`).join(', ');
  return [
    `const ${type.name} = { _table: '${type.name.toLowerCase()}s', _links: [${links}] as const };`,
    '',
  ];
}
