import type { Pool } from 'mysql2/promise';
import { uuidv7 } from '../common/uuid.js';
import { withTransaction } from '../db/pool.js';
import {
  findOrCreateCategoryAndTitle,
  hasCategoryByLowerName,
} from '../db/repositories/dictionary.repo.js';
import {
  countTeamFollowups,
  insertFollowupItem,
} from '../db/repositories/followups.repo.js';

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

/**
 * Ensures default categories & titles from the reference CGHQ report exist for a team.
 */
export async function ensureDefaultDictionary(pool: Pool, teamId: string): Promise<void> {
  const alreadySeeded = await hasCategoryByLowerName(pool, teamId, 'Physically Visit');
  if (alreadySeeded) return;

  await withTransaction(pool, async (conn) => {
    for (const pair of DEFAULT_DICTIONARY_PAIRS) {
      await findOrCreateCategoryAndTitle(conn, teamId, pair.categoryName, pair.titleName);
    }
  });
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
  const count = await countTeamFollowups(pool, teamId);
  if (count > 0) return;

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
}
