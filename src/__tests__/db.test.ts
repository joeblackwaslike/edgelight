import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, openDb } from '../db.js';

const TEST_DB = './test-db-phase1';

afterEach(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { recursive: true });
});

describe('openDb', () => {
  it('creates the data directory if it does not exist', async () => {
    const db = await openDb(TEST_DB, './schema.esdl');
    expect(existsSync(TEST_DB)).toBe(true);
    await closeDb(db);
  });
});
