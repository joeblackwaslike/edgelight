import { describe, expect, it } from 'vitest';
import { EdgeLiteConcurrencyError, EdgeLiteParseError, EdgeLiteSchemaError } from '../errors.js';

describe('error classes', () => {
  it('EdgeLiteParseError has correct name and message', () => {
    const error = new EdgeLiteParseError('bad token at line 3');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EdgeLiteParseError');
    expect(error.message).toBe('bad token at line 3');
  });

  it('EdgeLiteSchemaError has correct name', () => {
    const error = new EdgeLiteSchemaError('unapplied migrations: 00002-add-col.sql');
    expect(error.name).toBe('EdgeLiteSchemaError');
  });

  it('EdgeLiteConcurrencyError has correct name', () => {
    const error = new EdgeLiteConcurrencyError('db.run() called while another query is in flight');
    expect(error.name).toBe('EdgeLiteConcurrencyError');
  });
});
