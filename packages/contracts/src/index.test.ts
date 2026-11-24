import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateEntrySchema,
  CreateTeamSchema,
  HealthResponseSchema,
  UpdateTeamSettingsSchema,
} from './index.ts';

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

  it('allows custom mixed-case and symbol team codes without lowercasing', () => {
    const created = CreateTeamSchema.parse({
      teamName: 'team x',
      teamSlug: '2EC0DERTW',
    });
    assert.equal(created.teamSlug, '2EC0DERTW');

    const updated = UpdateTeamSettingsSchema.parse({
      slug: 'TEAM_X#2026',
    });
    assert.equal(updated.slug, 'TEAM_X#2026');

    const bad = CreateTeamSchema.safeParse({
      teamName: 'team x',
      teamSlug: 'bad/code',
    });
    assert.equal(bad.success, false);
  });
});
