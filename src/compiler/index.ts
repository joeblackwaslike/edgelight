/* eslint-disable import-x/no-relative-parent-imports */
import type {
  ExclusiveConstraintNode,
  IndexNode,
  LinkNode,
  ObjectTypeNode,
  PropertyNode,
  SdlAst,
  VectorTypeNode,
} from '@/parser/ast.js';
/* eslint-enable import-x/no-relative-parent-imports */

export function compileSdl(ast: SdlAst): string[] {
  const statements: string[] = [];
  for (const type of ast.types) {
    statements.push(...compileObjectType(type));
  }
  return statements;
}

function tableName(typeName: string): string {
  return `${typeName.toLowerCase()}s`;
}

function compileObjectType(type: ObjectTypeNode): string[] {
  const table = tableName(type.name);
  const columns: string[] = ['id TEXT PRIMARY KEY'];
  const linkNames = new Set(type.links.map((link) => link.name));

  for (const property of type.properties) {
    columns.push(compileProperty(property));
  }
  for (const link of type.links) {
    columns.push(compileLink(link));
  }
  for (const constraint of type.constraints) {
    columns.push(compileConstraint(constraint, linkNames));
  }

  const statements: string[] = [`CREATE TABLE ${table} (\n  ${columns.join(',\n  ')}\n)`];

  for (const indexNode of type.indexes) {
    statements.push(...compileIndex(indexNode, table));
  }

  return statements;
}

function compileProperty(property: PropertyNode): string {
  const colType = scalarToSql(property.type);
  const notNull = property.required ? ' NOT NULL' : '';
  const defaultClause =
    property.default === undefined ? '' : ` DEFAULT ${sqlLiteral(property.default)}`;
  return `${property.name} ${colType}${notNull}${defaultClause}`;
}

function scalarToSql(type: string | VectorTypeNode): string {
  if (typeof type === 'object') return `vector(${type.dimensions})`;
  switch (type) {
    case 'str': {
      return 'TEXT';
    }
    case 'int64': {
      return 'BIGINT';
    }
    case 'bool': {
      return 'BOOLEAN';
    }
    case 'json': {
      return 'JSONB';
    }
    default: {
      return 'TEXT';
    }
  }
}

function sqlLiteral(value: string | number | boolean): string {
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function compileLink(link: LinkNode): string {
  const refTable = tableName(link.targetType);
  const notNull = link.required ? ' NOT NULL' : '';
  return `${link.name}_id TEXT${notNull} REFERENCES ${refTable}(id)`;
}

function compileConstraint(constraint: ExclusiveConstraintNode, linkNames: Set<string>): string {
  const cols = constraint.properties
    .map((property) => (linkNames.has(property) ? `${property}_id` : property))
    .join(', ');
  return `UNIQUE(${cols})`;
}

function compileIndex(indexNode: IndexNode, table: string): string[] {
  if (indexNode.kind === 'index_fts') {
    return compileFtsIndex(indexNode.property, table);
  }
  return [`CREATE INDEX ON ${table} USING ivfflat (${indexNode.property} vector_cosine_ops)`];
}

function compileFtsIndex(property: string, table: string): string[] {
  return [
    `ALTER TABLE ${table} ADD COLUMN fts_vector TSVECTOR`,
    `CREATE INDEX ON ${table} USING GIN (fts_vector)`,
    `CREATE OR REPLACE FUNCTION ${table}_fts_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector := to_tsvector('english', COALESCE(NEW.${property}, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
    `CREATE TRIGGER ${table}_fts_trigger
BEFORE INSERT OR UPDATE ON ${table}
FOR EACH ROW EXECUTE FUNCTION ${table}_fts_update()`,
  ];
}
