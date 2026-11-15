import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertDateAllowedForCreate,
  assertValidIsoDate,
  diffDaysIso,
  getTeamTodayDate,
} from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../db/sql');

describe('Phase 3 Timezone, Date Rules & SQL Hygiene', () => {
  it('computes team local YYYY-MM-DD correctly across midnight boundaries', () => {
    // 2026-11-05 18:30:00 UTC is 2026-11-06 00:30:00 in Asia/Dhaka (+06:00)
    const utcEvening = new Date('2026-11-05T18:30:00Z');
    assert.equal(getTeamTodayDate('UTC', utcEvening), '2026-11-05');
    assert.equal(getTeamTodayDate('Asia/Dhaka', utcEvening), '2026-11-06');
  });

  it('validates ISO calendar dates and rejects impossible dates', () => {
    assert.equal(assertValidIsoDate(' 2026-11-05 '), '2026-11-05');
    assert.throws(() => assertValidIsoDate('2026-13-01'), BadRequestException);
    assert.throws(() => assertValidIsoDate('2026-02-30'), BadRequestException);
    assert.throws(() => assertValidIsoDate('05-11-2026'), BadRequestException);
  });

  it('computes day differences and enforces FR-5 backfill rules', () => {
    assert.equal(diffDaysIso('2026-11-15', '2026-11-08'), 7);
    assert.equal(diffDaysIso('2026-11-15', '2026-11-16'), -1);

    // Future date blocked for everyone
    assert.throws(
      () => assertDateAllowedForCreate('2026-11-16', '2026-11-15', 'lead'),
      BadRequestException,
    );
    assert.throws(
      () => assertDateAllowedForCreate('2026-11-16', '2026-11-15', 'member'),
      BadRequestException,
    );

    // Member: up to 7 days allowed, 8+ days forbidden
    assertDateAllowedForCreate('2026-11-15', '2026-11-15', 'member');
    assertDateAllowedForCreate('2026-11-08', '2026-11-15', 'member');
    assert.throws(
      () => assertDateAllowedForCreate('2026-11-07', '2026-11-15', 'member'),
      ForbiddenException,
    );

    // Team Lead: unlimited backfill allowed
    assertDateAllowedForCreate('2025-01-01', '2026-11-15', 'lead');
  });

  it('includes dictionary.sql.ts and reports.sql.ts in raw SQL directory', () => {
    const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql.ts'));
    assert.ok(files.includes('dictionary.sql.ts'));
    assert.ok(files.includes('reports.sql.ts'));
  });
});
