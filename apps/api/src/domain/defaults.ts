import type { Pool } from 'pg';
import { uuidv7 } from '../common/uuid.js';
import { withTransaction } from '../db/pool.js';
import {
  findOrCreateCategoryAndTitle,
  hasCategoryByLowerName,
  listDictionary,
} from '../db/repositories/dictionary.repo.js';
import {
  countTeamFollowups,
  deduplicateTeamFollowups,
  insertFollowupItem,
} from '../db/repositories/followups.repo.js';
import {
  countWorkGroupsByReport,
  insertWorkEntry,
  insertWorkGroupAtPosition,
  listEmptyCommunicationGroupIds,
} from '../db/repositories/reports.repo.js';

export const DEFAULT_REPORT_GROUPS: ReadonlyArray<{
  categoryName: string;
  titleName: string;
  numberingMode: 'numbered' | 'plain';
}> = [
  {
    categoryName: 'Support',
    titleName: 'Daily Calls from User and Desk Support',
    numberingMode: 'numbered',
  },
  { categoryName: 'Communication', titleName: 'New Comer', numberingMode: 'plain' },
  { categoryName: 'Communication', titleName: 'Over the Phone', numberingMode: 'plain' },
  {
    categoryName: 'Physically Visit',
    titleName: 'Department Visit for Use of CGRPMS and Any Other Reason',
    numberingMode: 'plain',
  },
];

export const DEFAULT_DICTIONARY_PAIRS: ReadonlyArray<{
  categoryName: string;
  titleName: string;
}> = [
  { categoryName: 'Support', titleName: 'Daily Calls from User and Desk Support' },
  { categoryName: 'Communication', titleName: 'New Comer' },
  { categoryName: 'Communication', titleName: 'Over the Phone' },
  {
    categoryName: 'Physically Visit',
    titleName: 'Department Visit for Use of CGRPMS and Any Other Reason',
  },
  { categoryName: 'Mobile Apps', titleName: 'Messaging Mobile Apps' },
  { categoryName: 'Bill', titleName: 'Hospital Management System' },
  { categoryName: 'Bill', titleName: 'Library Management System' },
  { categoryName: 'Bill', titleName: 'Dockyard Management System' },
  { categoryName: 'Bill', titleName: 'CGRPMS Monthly Bill (October)' },
];

export const DEFAULT_FOLLOWUPS: ReadonlyArray<{
  categoryName: string;
  titleName: string;
  statusText: string;
  completedByLabel: string;
}> = [
  {
    categoryName: 'Mobile Apps',
    titleName: 'Messaging Mobile Apps',
    statusText:
      'Coordination is ongoing for scope confirmation and app delivery scheduling.',
    completedByLabel: 'As Previous',
  },
  {
    categoryName: 'Bill',
    titleName: 'Hospital Management System',
    statusText:
      'Discussed deployment prerequisites and network readiness with unit stakeholders.',
    completedByLabel: 'As Previous',
  },
  {
    categoryName: 'Bill',
    titleName: 'Library Management System',
    statusText: 'The Proposal has been submitted.',
    completedByLabel: 'As Previous',
  },
  {
    categoryName: 'Bill',
    titleName: 'Dockyard Management System',
    statusText: 'The Proposal has been submitted.',
    completedByLabel: 'As Previous',
  },
  {
    categoryName: 'Bill',
    titleName: 'CGRPMS Monthly Bill (October)',
    statusText: 'The bill was sent to the bill section, and they are processing it.',
    completedByLabel: 'As Previous',
  },
];

const seededDictionaryTeams = new Set<string>();
const seededFollowupsTeams = new Set<string>();
const seededReportGroups = new Set<string>();

async function isCghqTeam(conn: Pool, teamId: string): Promise<boolean> {
  const res = await conn.query<{ name: string; slug: string }>(
    `SELECT name, slug FROM teams WHERE id = $1 LIMIT 1`,
    [teamId],
  );
  const row = res.rows[0];
  if (!row) return false;
  const nameLower = row.name.trim().toLowerCase();
  const slugLower = row.slug.trim().toLowerCase();
  return nameLower === 'cghq' || slugLower.startsWith('cghq');
}

/**
 * Restores initial dictionary categories & titles for the CGHQ team (daily vs followup scopes);
 * leaves other teams untouched so they configure their own dictionary items.
 */
export async function ensureDefaultDictionary(pool: Pool, teamId: string): Promise<void> {
  if (seededDictionaryTeams.has(teamId)) return;

  const cghq = await isCghqTeam(pool, teamId);
  if (!cghq) {
    seededDictionaryTeams.add(teamId);
    return;
  }

  await withTransaction(pool, async (conn) => {
    for (const grp of DEFAULT_REPORT_GROUPS) {
      await findOrCreateCategoryAndTitle(conn, teamId, grp.categoryName, grp.titleName, 'daily');
    }
    for (const fu of DEFAULT_FOLLOWUPS) {
      await findOrCreateCategoryAndTitle(conn, teamId, fu.categoryName, fu.titleName, 'followup');
    }
    await conn.query(
      `UPDATE titles t
       SET scope = 'followup'
       FROM categories c
       WHERE t.category_id = c.id
         AND t.team_id = $1
         AND LOWER(TRIM(c.name)) IN ('mobile apps', 'bill')`,
      [teamId],
    );
  });
  seededDictionaryTeams.add(teamId);
}

/**
 * Restores initial 5 follow-up items for the CGHQ team when it has 0 follow-ups;
 * other teams start with no default follow-up items.
 */
export async function ensureDefaultFollowups(
  pool: Pool,
  teamId: string,
  actorUserId: string,
): Promise<void> {
  await deduplicateTeamFollowups(pool, teamId);
  if (seededFollowupsTeams.has(teamId)) return;

  const cghq = await isCghqTeam(pool, teamId);
  if (!cghq) {
    seededFollowupsTeams.add(teamId);
    return;
  }

  const count = await countTeamFollowups(pool, teamId);
  if (count > 0) {
    seededFollowupsTeams.add(teamId);
    return;
  }

  await withTransaction(pool, async (conn) => {
    const innerCount = await countTeamFollowups(conn, teamId);
    if (innerCount > 0) return;

    for (let i = 0; i < DEFAULT_FOLLOWUPS.length; i += 1) {
      const item = DEFAULT_FOLLOWUPS[i]!;
      const { categoryId, titleId } = await findOrCreateCategoryAndTitle(
        conn,
        teamId,
        item.categoryName,
        item.titleName,
        'followup',
      );
      await insertFollowupItem(conn, {
        id: uuidv7(),
        teamId,
        categoryId,
        titleId,
        statusText: item.statusText,
        completedByLabel: item.completedByLabel,
        completedByMemberId: null,
        position: (i + 1) * 1000,
        actorUserId,
      });
    }
  });
  seededFollowupsTeams.add(teamId);
}

/**
 * Keeps a draft/reopened daily report synchronized with the team's fixed dictionary rows
 * where scope = 'daily', removing any 'followup'-scoped groups and seeding Communication Nil placeholders.
 */
export async function ensureDefaultReportGroups(
  pool: Pool,
  teamId: string,
  reportId: string,
  actorUserId: string,
): Promise<void> {
  const cghq = await isCghqTeam(pool, teamId);
  if (cghq) {
    await ensureDefaultDictionary(pool, teamId);
  }

  await pool.query(
    `DELETE FROM work_groups wg
     USING titles t
     WHERE wg.report_id = $1
       AND wg.title_id = t.id
       AND t.scope = 'followup'
       AND NOT EXISTS (
         SELECT 1 FROM work_entries we WHERE we.group_id = wg.id
       )`,
    [reportId],
  );

  const dictionary = await listDictionary(pool, teamId);
  const dailyPairs: Array<{
    categoryId: string;
    categoryName: string;
    titleId: string;
  }> = [];

  for (const cat of dictionary) {
    if (!cat.isActive) continue;
    for (const title of cat.titles) {
      if (!title.isActive || title.scope === 'followup') continue;
      dailyPairs.push({
        categoryId: cat.id,
        categoryName: cat.name,
        titleId: title.id,
      });
    }
  }

  if (dailyPairs.length > 0 && !seededReportGroups.has(reportId)) {
    const existingCount = await countWorkGroupsByReport(pool, reportId);
    await withTransaction(pool, async (conn) => {
      for (let i = 0; i < dailyPairs.length; i += 1) {
        const pair = dailyPairs[i]!;
        const isSupport = pair.categoryName.trim().toLowerCase() === 'support';
        await insertWorkGroupAtPosition(conn, {
          id: uuidv7(),
          reportId,
          categoryId: pair.categoryId,
          titleId: pair.titleId,
          position: existingCount > 0 ? (existingCount + i + 1) * 10 : (i + 1) * 10,
          numberingMode: isSupport ? 'numbered' : 'plain',
          actorUserId,
        });
      }
    });
    seededReportGroups.add(reportId);
  }

  const emptyCommIds = await listEmptyCommunicationGroupIds(pool, reportId);
  if (emptyCommIds.length > 0) {
    await withTransaction(pool, async (conn) => {
      for (const groupId of emptyCommIds) {
        await insertWorkEntry(conn, {
          id: uuidv7(),
          groupId,
          statusText: 'Officer: Nil',
          completedByMemberId: null,
          completedByLabel: null,
          position: 1000,
          createdByUserId: null,
        });
        await insertWorkEntry(conn, {
          id: uuidv7(),
          groupId,
          statusText: 'Sailor: Nil',
          completedByMemberId: null,
          completedByLabel: null,
          position: 2000,
          createdByUserId: null,
        });
      }
    });
  }
}
