/* eslint-disable import-x/no-relative-parent-imports */
import type {
  CountBuilder,
  FilterExpr,
  FtsBuilder,
  InsertBuilder,
  NeighborsBuilder,
  OpExpr,
  Query,
  SelectBuilder,
  SelectShape,
  UpdateBuilder,
} from '../codegen/builders.js';

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  shape?: SelectShape;
}

export function compileQuery(query: Query<unknown>): CompiledQuery {
  switch (query.kind) {
    case 'select': {
      return compileSelect(query);
    }
    case 'insert': {
      return compileInsert(query);
    }
    case 'update': {
      return compileUpdate(query);
    }
    case 'count': {
      return compileCount(query);
    }
    case 'neighbors': {
      return compileNeighbors(query);
    }
    case 'fts': {
      return compileFts(query);
    }
  }
}

interface ShapeParts {
  cols: string[];
  joins: string[];
}

function buildShapeParts(shape: SelectShape, table: string, alias: string): ShapeParts {
  const cols: string[] = [];
  const joins: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    if (value === true) {
      cols.push(`${alias}.${key}`);
    } else if (typeof value === 'object') {
      const linkAlias = key.charAt(0);
      joins.push(`LEFT JOIN ${table} ${linkAlias} ON ${linkAlias}.id = ${alias}.${key}_id`);
      for (const subKey of Object.keys(value)) {
        cols.push(`${linkAlias}.${subKey} AS ${key}__${subKey}`);
      }
    }
  }
  return { cols, joins };
}

function compileSelect(q: SelectBuilder<unknown>): CompiledQuery {
  const parameters: unknown[] = [];
  const alias = 'n';
  const { cols, joins } = buildShapeParts(q.shape, q.table, alias);

  let sql = `SELECT ${cols.join(', ')}\nFROM ${q.table} ${alias}`;
  if (joins.length > 0) sql += `\n${joins.join('\n')}`;

  if (q.filter) {
    sql += `\nWHERE ${compileFilter(q.filter, alias, parameters)}`;
  }

  if (q.orderBy) {
    sql += `\nORDER BY ${alias}.${q.orderBy.expr.column} ${q.orderBy.dir}`;
  }

  if (q.limit !== undefined) {
    parameters.push(q.limit);
    sql += `\nLIMIT $${parameters.length}`;
  }

  return { sql, params: parameters, shape: q.shape };
}

function compileInsert(q: InsertBuilder<unknown>): CompiledQuery {
  const parameters: unknown[] = [];
  const cols: string[] = ['id'];
  const placeholders: string[] = ['gen_random_uuid()::text'];
  const linkSet = new Set(q._links);

  for (const [key, value] of Object.entries(q.data)) {
    const colName = linkSet.has(key) ? `${key}_id` : key;
    cols.push(colName);
    parameters.push(value);
    placeholders.push(`$${parameters.length}`);
  }

  const colList = cols.join(', ');
  const valueList = placeholders.join(', ');
  const conflict = q.onConflict === 'ignore' ? '\nON CONFLICT DO NOTHING' : '';

  return {
    sql: `INSERT INTO ${q.table} (${colList})\nVALUES (${valueList})${conflict}\nRETURNING *`,
    params: parameters,
  };
}

function compileUpdate(q: UpdateBuilder<unknown>): CompiledQuery {
  const parameters: unknown[] = [];
  const setClauses: string[] = [];

  for (const [key, value] of Object.entries(q.set)) {
    parameters.push(value);
    setClauses.push(`${key} = $${parameters.length}`);
  }

  return {
    sql: `UPDATE ${q.table} SET ${setClauses.join(', ')}\nWHERE ${compileFilter(q.filter, '', parameters)}`,
    params: parameters,
  };
}

function compileCount(q: CountBuilder): CompiledQuery {
  const parameters: unknown[] = [];
  let sql = `SELECT COUNT(*)::int FROM ${q.table}`;
  if (q.filter) sql += `\nWHERE ${compileFilter(q.filter, '', parameters)}`;
  return { sql, params: parameters };
}

function compileNeighbors(q: NeighborsBuilder<unknown>): CompiledQuery {
  return {
    sql: [
      'SELECT DISTINCT n.* FROM nodes n',
      'JOIN edges e',
      '  ON (e.src_id = $1 AND e.dst_id = n.id)',
      '  OR (e.dst_id = $1 AND e.src_id = n.id)',
      "WHERE n.status = 'live'",
      '  AND e.kind = ANY($2::text[])',
    ].join('\n'),
    params: [q.nodeId, q.edgeKinds],
  };
}

function compileFts(q: FtsBuilder<unknown>): CompiledQuery {
  return {
    sql: [
      'SELECT n.*, ts_rank(n.fts_vector, tsq) AS rank',
      `FROM ${q.table} n, plainto_tsquery('english', $1) tsq`,
      'WHERE n.fts_vector @@ tsq',
      'ORDER BY rank DESC',
    ].join('\n'),
    params: [q.query],
  };
}

function compileFilter(expr: FilterExpr, alias: string, parameters: unknown[]): string {
  switch (expr.kind) {
    case 'op': {
      return compileOp(expr, alias, parameters);
    }
    case 'all': {
      return expr.exprs
        .map((subExpr) => `(${compileFilter(subExpr, alias, parameters)})`)
        .join(' AND ');
    }
    case 'any': {
      return expr.exprs
        .map((subExpr) => `(${compileFilter(subExpr, alias, parameters)})`)
        .join(' OR ');
    }
  }
}

function compileOp(expr: OpExpr, alias: string, parameters: unknown[]): string {
  const col = alias ? `${alias}.${expr.left.column}` : expr.left.column;
  parameters.push(expr.right);
  return `${col} ${expr.operator} $${parameters.length}`;
}
