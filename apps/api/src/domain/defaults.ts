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

/**
 * No-op: new teams start with a blank dictionary and configure their own categories/titles.
 */
export async function ensureDefaultDictionary(_pool: Pool, _teamId: string): Promise<void> {
  return;
}

/**
 * No-op: new teams start with no default follow-up items or follow-up table.
 */
export async function ensureDefaultFollowups(
  _pool: Pool,
  _teamId: string,
  _actorUserId: string,
): Promise<void> {
  return;
}

/**
 * Populates a draft/reopened daily report with the team's fixed dictionary (category, title)
 * rows, preserving them across every day, and seeds Communication placeholders when empty.
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
    seededReportGroups.add(reportId);
    return;
  }

  const dictionary = await listDictionary(pool, teamId);
  const pairs: Array<{
    categoryId: string;
    categoryName: string;
    titleId: string;
  }> = [];

  for (const cat of dictionary) {
    if (!cat.isActive) continue;
    for (const title of cat.titles) {
      if (!title.isActive) continue;
      pairs.push({
        categoryId: cat.id,
        categoryName: cat.name,
        titleId: title.id,
      });
    }
  }

  if (pairs.length === 0) {
    return;
  }

  await withTransaction(pool, async (conn) => {
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i]!;
      const isSupport = pair.categoryName.trim().toLowerCase() === 'support';
      const isComm = pair.categoryName.trim().toLowerCase() === 'communication';
      const groupId = uuidv7();
      await insertWorkGroupAtPosition(conn, {
        id: groupId,
        reportId,
        categoryId: pair.categoryId,
        titleId: pair.titleId,
        position: (i + 1) * 10,
        numberingMode: isSupport ? 'numbered' : 'plain',
        actorUserId,
      });

      if (isComm) {
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
    }
  });
  seededReportGroups.add(reportId);
}
