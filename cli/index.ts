#!/usr/bin/env node
/* eslint-disable import-x/no-relative-parent-imports */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateQueryBuilder } from '../src/codegen/index.js';
import { parseSdl } from '../src/parser/index.js';

const [command, ...args] = process.argv.slice(2);
const schemaPath = args[0] ?? 'dbschema/schema.esdl';
const outPath = 'dbschema/edgelite.ts';

switch (command) {
  case 'codegen': {
    const source = readFileSync(schemaPath, 'utf8');
    const ast = parseSdl(source);
    const ts = generateQueryBuilder(ast);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, ts, 'utf8');
    console.log(`Generated ${outPath} from ${schemaPath}`);
    break;
  }
  case 'migration': {
    process.stderr.write("'migration' command not yet implemented — Phase 6\n");
    process.exit(1);
    break;
  }
  default: {
    process.stderr.write(`Unknown command: ${command ?? '(none)'}\n`);
    process.stderr.write(
      'Usage: edgelite codegen [schema.esdl] | migration <create|apply|status>\n',
    );
    process.exit(1);
  }
}
