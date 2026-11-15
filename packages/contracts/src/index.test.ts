import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CreateEntrySchema, HealthResponseSchema } from './index.ts';

describe('@cghq/contracts', () => {
  it('validates health response', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      db: 'up',
      migrationVersion: '0001_init',
      timestamp: '2026-11-15T00:00:00.000Z',
    });
    assert.equal(parsed.status, 'ok');
  });

  it('rejects blank categoryName in CreateEntrySchema', () => {
    const res = CreateEntrySchema.safeParse({
      categoryName: '   ',
      titleName: 'API Setup',
      statusLines: ['Done'],
      completedByMemberIds: ['01930000-0000-7000-8000-000000000001'],
    });
    assert.equal(res.success, false);
  });
});
