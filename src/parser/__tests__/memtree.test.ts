import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSdl } from '../index.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

describe('parseSdl — memtree round-trip', () => {
  it('parses the full memtree schema without errors', () => {
    const source = readFileSync(path.join(directory, 'fixtures/memtree.esdl'), 'utf8');
    const ast = parseSdl(source);

    expect(ast.enums.map((enumNode) => enumNode.name)).toEqual([
      'NodeKind',
      'NodeStatus',
      'EdgeKind',
    ]);
    expect(ast.enums[0]?.values).toEqual([
      'session',
      'file_chunk',
      'tool_output',
      'summary',
      'note',
      'observation',
      'web_chunk',
    ]);

    expect(ast.types.map((t) => t.name)).toEqual(['Node', 'Edge']);

    const nodeType = ast.types.find((t) => t.name === 'Node');
    expect(nodeType?.indexes).toHaveLength(2);
    expect(nodeType?.links).toHaveLength(1);

    const edgeType = ast.types.find((t) => t.name === 'Edge');
    expect(edgeType?.constraints).toHaveLength(1);
  });
});
