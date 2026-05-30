// eslint-disable-next-line import-x/no-relative-parent-imports
import { EdgeLiteParseError } from '@/errors.js';
import peggy from 'peggy';
import type { LinkNode, ObjectTypeNode, PropertyNode, ScalarEnumNode, SdlAst } from './ast.js';
import { GRAMMAR } from './grammar.js';

// Parser is generated once at module load from the embedded grammar string.
// eslint-disable-next-line import-x/no-named-as-default-member
const parser = peggy.generate(GRAMMAR);

function resolveLinksAndProperties(types: ObjectTypeNode[], enumNames: Set<string>): void {
  for (const type of types) {
    const links: LinkNode[] = [];
    const properties: PropertyNode[] = [];
    for (const property of type.properties) {
      if (
        typeof property.type === 'string' &&
        /^[A-Z]/.test(property.type) &&
        !enumNames.has(property.type)
      ) {
        links.push({
          kind: 'link',
          name: property.name,
          targetType: property.type,
          required: property.required,
        });
      } else {
        properties.push(property);
      }
    }
    type.properties = properties;
    type.links = links;
  }
}

export function parseSdl(source: string): SdlAst {
  let items: unknown[];
  try {
    items = parser.parse(source) as unknown[];
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : `Parse error: ${JSON.stringify(error)}`;
    throw new EdgeLiteParseError(message);
  }

  const enums: ScalarEnumNode[] = [];
  const types: ObjectTypeNode[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const node = item as { kind: string };
    if (node.kind === 'scalar_enum') enums.push(node as ScalarEnumNode);
    else if (node.kind === 'object_type') types.push(node as ObjectTypeNode);
  }

  // Reclassify uppercase-typed properties as links unless the type is a known
  // enum name. This resolves the parse-time ambiguity between object links
  // (parent: Node) and enum properties (kind: NodeKind) at the semantic level.
  resolveLinksAndProperties(types, new Set(enums.map((enumNode) => enumNode.name)));

  return { enums, types };
}
