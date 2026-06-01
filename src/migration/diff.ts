/* eslint-disable import-x/no-relative-parent-imports */
import type { PGlite } from '@electric-sql/pglite';
import { compileSdl } from '../compiler/index.js';
import type { SdlAst } from '../parser/ast.js';

export interface DbColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
}

export interface DbSchema {
  tables: DbTable[];
}

export async function introspectDb(pglite: PGlite): Promise<DbSchema> {
  const tablesResult = await pglite.query<{ tableName: string }>(`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND LEFT(table_name, 9) != '_edgelite'
    ORDER BY table_name
  `);

  const tables: DbTable[] = [];
  for (const row of tablesResult.rows) {
    const colsResult = await pglite.query<{
      columnName: string;
      dataType: string;
      isNullable: string;
    }>(
      `
      SELECT column_name AS "columnName",
             data_type AS "dataType",
             is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
      [row.tableName],
    );

    tables.push({
      name: row.tableName,
      columns: colsResult.rows.map((c) => ({
        name: c.columnName,
        dataType: c.dataType,
        nullable: c.isNullable === 'YES',
      })),
    });
  }

  return { tables };
}

export type ChangeKind =
  | 'add_table'
  | 'drop_table'
  | 'add_column'
  | 'drop_column'
  | 'add_index'
  | 'add_constraint';

export interface SchemaChange {
  kind: ChangeKind;
  typeName?: string;
  tableName?: string;
  columnName?: string;
  sql?: string;
  destructive: boolean;
}

function tableNameFor(typeName: string): string {
  return `${typeName.toLowerCase()}s`;
}

function expectedSdlColumns(type: SdlAst['types'][number]): Set<string> {
  return new Set([
    'id',
    ...type.properties.map((p) => p.name),
    ...type.links.map((l) => `${l.name}_id`),
  ]);
}

function diffColumns(table: string, dbTable: DbTable, sdlCols: Set<string>): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const dbCols = new Set(dbTable.columns.map((c) => c.name));
  for (const col of sdlCols) {
    if (!dbCols.has(col)) {
      changes.push({
        kind: 'add_column',
        tableName: table,
        columnName: col,
        destructive: false,
      });
    }
  }
  for (const col of dbCols) {
    if (sdlCols.has(col) || col === 'fts_vector') continue;
    changes.push({
      kind: 'drop_column',
      tableName: table,
      columnName: col,
      destructive: true,
    });
  }
  return changes;
}

export function diffSdlVsDb(ast: SdlAst, db: DbSchema): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const sdlTableNames = new Set(ast.types.map((t) => tableNameFor(t.name)));
  const dbTableByName = new Map(db.tables.map((t) => [t.name, t]));

  for (const type of ast.types) {
    const table = tableNameFor(type.name);
    const dbTable = dbTableByName.get(table);
    if (dbTable === undefined) {
      const typeStatements = compileSdl({ enums: ast.enums, types: [type] });
      changes.push({
        kind: 'add_table',
        typeName: type.name,
        tableName: table,
        sql: typeStatements.map((s) => (s.trimEnd().endsWith(';') ? s : `${s};`)).join('\n'),
        destructive: false,
      });
      continue;
    }
    changes.push(...diffColumns(table, dbTable, expectedSdlColumns(type)));
  }

  for (const dbTable of db.tables) {
    if (sdlTableNames.has(dbTable.name)) continue;
    changes.push({ kind: 'drop_table', tableName: dbTable.name, destructive: true });
  }

  return changes;
}
