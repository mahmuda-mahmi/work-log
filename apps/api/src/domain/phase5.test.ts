import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedCronRequest } from '../modules/cron/cron.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../db/sql');

describe('Phase 5 Cron & Ops Hygiene', () => {
  it('includes cron.sql.ts in raw SQL directory', () => {
    const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql.ts'));
    assert.ok(files.includes('cron.sql.ts'));
  });

  it('validates CRON_SECRET bearer header with constant-time comparison', () => {
    assert.equal(isAuthorizedCronRequest(undefined, undefined), true);
    assert.equal(isAuthorizedCronRequest(undefined, 'top-secret'), false);
    assert.equal(isAuthorizedCronRequest('Bearer wrong', 'top-secret'), false);
    assert.equal(isAuthorizedCronRequest('Bearer top-secret', 'top-secret'), true);
  });
});
