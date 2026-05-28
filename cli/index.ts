#!/usr/bin/env node
// EdgeLite CLI — commands: codegen | migration create | migration apply | migration status
const command = process.argv[2];

if (command === 'codegen' || command === 'migration') {
  process.stderr.write(`Command '${command}' not yet implemented\n`);
  process.exit(1);
}

process.stderr.write(`Unknown command: ${command ?? '(none)'}\n`);
process.stderr.write('Usage: edgelite codegen | migration <create|apply|status>\n');
process.exit(1);
