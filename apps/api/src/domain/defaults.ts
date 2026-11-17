import type { Pool } from 'pg';
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
 * No-op: new teams start with a blank daily report table (headers only).
 */
export async function ensureDefaultReportGroups(
  _pool: Pool,
  _teamId: string,
  _reportId: string,
  _actorUserId: string,
): Promise<void> {
  return;
}
