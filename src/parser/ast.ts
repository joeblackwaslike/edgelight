export type ScalarKind = 'str' | 'int64' | 'bool' | 'json';

export interface PropertyNode {
  kind: 'property';
  name: string;
  type: string | VectorTypeNode;
  required: boolean;
  default?: string | number | boolean;
}

export interface VectorTypeNode {
  kind: 'vector';
  dimensions: number;
}

export interface LinkNode {
  kind: 'link';
  name: string;
  targetType: string;
  required: boolean;
}

export interface ScalarEnumNode {
  kind: 'scalar_enum';
  name: string;
  values: string[];
}

export interface FtsIndexNode {
  kind: 'index_fts';
  property: string;
}

export interface VecIndexNode {
  kind: 'index_vec';
  property: string;
  using: 'ivfflat';
}

export type IndexNode = FtsIndexNode | VecIndexNode;

export interface ExclusiveConstraintNode {
  kind: 'constraint_exclusive';
  properties: string[];
}

export interface ObjectTypeNode {
  kind: 'object_type';
  name: string;
  properties: PropertyNode[];
  links: LinkNode[];
  indexes: IndexNode[];
  constraints: ExclusiveConstraintNode[];
}

export interface SdlAst {
  enums: ScalarEnumNode[];
  types: ObjectTypeNode[];
}
