/* eslint-disable import-x/no-relative-parent-imports */
import type { SelectShape } from '../codegen/builders.js';

export function mapResult(rows: Record<string, unknown>[], shape?: SelectShape): unknown[] {
  if (!shape) return rows;
  return rows.map((row) => mapRow(row, shape));
}

function mapNestedLink(
  row: Record<string, unknown>,
  key: string,
  subShape: SelectShape,
): Record<string, unknown> | null {
  const firstSubKey = Object.keys(subShape)[0];
  if (!firstSubKey || row[`${key}__${firstSubKey}`] == null) return null;
  const nested: Record<string, unknown> = {};
  for (const subKey of Object.keys(subShape)) {
    nested[subKey] = row[`${key}__${subKey}`] ?? null;
  }
  return nested;
}

function mapRow(row: Record<string, unknown>, shape: SelectShape): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(shape)) {
    if (value === true) {
      result[key] = row[key] ?? null;
    } else if (typeof value === 'object') {
      result[key] = mapNestedLink(row, key, value);
    }
  }
  return result;
}
