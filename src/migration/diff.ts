import type { PGlite } from '@electric-sql/pglite';

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
  const tablesResult = await pglite.query<{ tableName: string }>(String.raw`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '\_edgelite%'
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
