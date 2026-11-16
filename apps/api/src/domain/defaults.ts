import type { Pool } from 'mysql2/promise';
import { uuidv7 } from '../common/uuid.js';
import { withTransaction } from '../db/pool.js';
import {
  findOrCreateCategoryAndTitle,
  hasCategoryByLowerName,
} from '../db/repositories/dictionary.repo.js';
import {
  countTeamFollowups,
  deduplicateTeamFollowups,
  insertFollowupItem,
} from '../db/repositories/followups.repo.js';
import {
  countWorkGroupsByReport,
  insertWorkGroupAtPosition,
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

/**
 * Ensures default categories & titles from the reference CGHQ report exist for a team.
 */
export async function ensureDefaultDictionary(pool: Pool, teamId: string): Promise<void> {
  if (seededDictionaryTeams.has(teamId)) return;

  const alreadySeeded = await hasCategoryByLowerName(pool, teamId, 'Physically Visit');
  if (alreadySeeded) {
    seededDictionaryTeams.add(teamId);
    return;
  }

  await withTransaction(pool, async (conn) => {
    for (const pair of DEFAULT_DICTIONARY_PAIRS) {
      await findOrCreateCategoryAndTitle(conn, teamId, pair.categoryName, pair.titleName);
    }
  });
  seededDictionaryTeams.add(teamId);
}

/**
 * Ensures the 5 default follow-up items from the reference CGHQ report are seeded
 * when a team has 0 follow-up items. Once seeded, user edits/deletions are preserved.
 */
export async function ensureDefaultFollowups(
  pool: Pool,
  teamId: string,
  actorUserId: string,
): Promise<void> {
  await deduplicateTeamFollowups(pool, teamId);
  if (seededFollowupsTeams.has(teamId)) return;

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
 * Ensures the 4 default report groups (Ser 1..4) from the reference CGHQ report exist
 * on a draft/reopened report in their canonical serial order.
 */
export async function ensureDefaultReportGroups(
  pool: Pool,
  teamId: string,
  reportId: string,
  actorUserId: string,
): Promise<void> {
  if (seededReportGroups.has(reportId)) return;

  const count = await countWorkGroupsByReport(pool, reportId);
  if (count > 0) {
    seededReportGroups.add(reportId);
    return;
  }

  await withTransaction(pool, async (conn) => {
    for (let i = 0; i < DEFAULT_REPORT_GROUPS.length; i += 1) {
      const grp = DEFAULT_REPORT_GROUPS[i]!;
      const { categoryId, titleId } = await findOrCreateCategoryAndTitle(
        conn,
        teamId,
        grp.categoryName,
        grp.titleName,
      );
      await insertWorkGroupAtPosition(conn, {
        id: uuidv7(),
        reportId,
        categoryId,
        titleId,
        position: (i + 1) * 10,
        numberingMode: grp.numberingMode,
        actorUserId,
      });
    }
  });
  seededReportGroups.add(reportId);
}
