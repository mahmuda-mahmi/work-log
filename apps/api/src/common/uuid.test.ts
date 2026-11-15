import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7 } from './uuid.ts';
import { SELECT_DB_PING, SELECT_LATEST_MIGRATION } from '../db/sql/health.sql.ts';

describe('API Phase 0 foundation', () => {
  it('generates valid, time-ordered UUIDv7 strings', async () => {
    const a = uuidv7();
    await new Promise((r) => setTimeout(r, 2));
    const b = uuidv7();

    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(a < b, 'UUIDv7 should sort chronologically');
  });

  it('keeps SQL constants free of SELECT *', () => {
    assert.equal(SELECT_DB_PING.includes('*'), false);
    assert.equal(SELECT_LATEST_MIGRATION.includes('*'), false);
  });
});
