export type FilterExpr = OpExpr | AllExpr | AnyExpr;

export interface OpExpr {
  kind: 'op';
  left: FieldRef;
  operator: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'LIKE';
  right: unknown;
}

export interface FieldRef {
  kind: 'field';
  table: string;
  column: string;
}

export interface AllExpr {
  kind: 'all';
  exprs: FilterExpr[];
}

export interface AnyExpr {
  kind: 'any';
  exprs: FilterExpr[];
}

export interface OrderByClause {
  expr: FieldRef;
  dir: 'ASC' | 'DESC';
}

export interface SelectShape {
  [field: string]: boolean | SelectShape;
}

export interface SelectBuilder<T> {
  kind: 'select';
  table: string;
  shape: SelectShape;
  filter?: FilterExpr;
  orderBy?: OrderByClause;
  limit?: number;
  _type: T;
}

export interface InsertBuilder<T> {
  kind: 'insert';
  table: string;
  /** Link field names — runtime uses these to remap {link: id} → {link_id: id} columns. */
  _links: readonly string[];
  data: Record<string, unknown>;
  onConflict?: 'ignore';
  _type: T;
  unlessConflict(): InsertBuilder<T>;
}

export interface UpdateBuilder<T> {
  kind: 'update';
  table: string;
  filter: FilterExpr;
  set: Record<string, unknown>;
  _type: T;
}

export interface CountBuilder {
  kind: 'count';
  table: string;
  filter?: FilterExpr;
}

export interface NeighborsBuilder<T> {
  kind: 'neighbors';
  nodeId: string;
  edgeKinds: string[];
  _type: T;
}

export interface FtsBuilder<T> {
  kind: 'fts';
  table: string;
  query: string;
  _type: T;
}

export type Query<T> =
  | SelectBuilder<T>
  | InsertBuilder<T>
  | UpdateBuilder<T>
  | CountBuilder
  | NeighborsBuilder<T>
  | FtsBuilder<T>;
