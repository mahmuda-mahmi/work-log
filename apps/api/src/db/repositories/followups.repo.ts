import type { FollowupItemDto, FollowupStatus } from '@cghq/contracts';
import type { DbClient } from '../pool.js';
import {
  ARCHIVE_ALL_FOLLOWUPS,
  ARCHIVE_FOLLOWUP_ITEM,
  COUNT_FOLLOWUPS_BY_TEAM,
  INSERT_FOLLOWUP_ITEM,
  SELECT_FOLLOWUPS_BY_TEAM,
  SELECT_FOLLOWUP_BY_ID,
  SELECT_NEXT_FOLLOWUP_POSITION,
  UPDATE_FOLLOWUP_ITEM_OPTIMISTIC,
  UPDATE_FOLLOWUP_POSITION,
} from '../sql/followups.sql.js';

type FollowupRow = {
  id: string;
  category_id: string | null;
  category_name: string;
  title_id: string | null;
  title_name: string;
  status: FollowupStatus;
  status_text: string;
  completed_by_member_id: string | null;
  completed_by_label: string | null;
  member_display_name: string | null;
  completed_on: string | null;
  position: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

function mapFollowupRow(r: FollowupRow): FollowupItemDto {
  return {
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    titleId: r.title_id,
    titleName: r.title_name,
    status: r.status,
    statusText: r.status_text,
    completedByMemberId: r.completed_by_member_id,
    completedByLabel: r.completed_by_label,
    completedByDisplay: r.member_display_name ?? r.completed_by_label ?? 'As Previous',
    completedOn: r.completed_on,
    position: r.position,
    version: r.version,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

const dedupedFollowupTeams = new Set<string>();

export async function deduplicateTeamFollowups(conn: DbClient, teamId: string): Promise<void> {
  if (dedupedFollowupTeams.has(teamId)) return;

  const res = await conn.query<{
    id: string;
    category_id: string | null;
    title_id: string | null;
    status_text: string;
  }>(
    `
    SELECT id, category_id, title_id, status_text
    FROM followup_items
    WHERE team_id = $1 AND status <> 'archived'
    ORDER BY position ASC, created_at ASC
    `,
    [teamId],
  );

  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const r of res.rows) {
    const key = `${r.category_id ?? ''}\u0000${r.title_id ?? ''}\u0000${r.status_text.trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicateIds.push(r.id);
    } else {
      seen.add(key);
    }
  }

  if (duplicateIds.length > 0) {
    await conn.query(`DELETE FROM followup_items WHERE team_id = $1 AND id = ANY($2::uuid[])`, [
      teamId,
      duplicateIds,
    ]);
  }

  dedupedFollowupTeams.add(teamId);
}

export async function findExistingActiveFollowup(
  conn: DbClient,
  params: {
    teamId: string;
    categoryId: string | null;
    titleId: string;
    statusText: string;
  },
): Promise<FollowupItemDto | null> {
  const res = await conn.query<FollowupRow>(
    `
    SELECT
      fi.id,
      fi.category_id,
      COALESCE(c.name, '') AS category_name,
      fi.title_id,
      COALESCE(t.name, '') AS title_name,
      fi.status,
      fi.status_text,
      fi.completed_by_member_id,
      fi.completed_by_label,
      tm.display_name AS member_display_name,
      TO_CHAR(fi.completed_on, 'YYYY-MM-DD') AS completed_on,
      fi.position,
      fi.version,
      fi.created_at,
      fi.updated_at
    FROM followup_items fi
    LEFT JOIN categories c ON c.id = fi.category_id
    LEFT JOIN titles t ON t.id = fi.title_id
    LEFT JOIN team_members tm ON tm.id = fi.completed_by_member_id
    WHERE fi.team_id = $1
      AND fi.status <> 'archived'
      AND COALESCE(fi.category_id::text, '') = COALESCE($2::text, '')
      AND fi.title_id = $3
      AND LOWER(TRIM(fi.status_text)) = LOWER(TRIM($4))
    LIMIT 1
    `,
    [params.teamId, params.categoryId, params.titleId, params.statusText],
  );
  return res.rows[0] ? mapFollowupRow(res.rows[0]) : null;
}

export async function listTeamFollowups(
  conn: DbClient,
  teamId: string,
  includeArchived = false,
): Promise<FollowupItemDto[]> {
  await deduplicateTeamFollowups(conn, teamId);
  const res = await conn.query<FollowupRow>(SELECT_FOLLOWUPS_BY_TEAM, [teamId, includeArchived]);
  return res.rows.map(mapFollowupRow);
}

export async function findFollowupById(
  conn: DbClient,
  teamId: string,
  followupId: string,
): Promise<FollowupItemDto | null> {
  const res = await conn.query<FollowupRow>(SELECT_FOLLOWUP_BY_ID, [teamId, followupId]);
  return res.rows[0] ? mapFollowupRow(res.rows[0]) : null;
}

export async function getNextFollowupPosition(conn: DbClient, teamId: string): Promise<number> {
  const res = await conn.query<{ next_pos: number }>(SELECT_NEXT_FOLLOWUP_POSITION, [teamId]);
  return Number(res.rows[0]?.next_pos ?? 1000);
}

export async function insertFollowupItem(
  conn: DbClient,
  input: {
    id: string;
    teamId: string;
    categoryId: string | null;
    titleId: string | null;
    statusText: string;
    completedByLabel: string | null;
    completedByMemberId: string | null;
    position: number;
    actorUserId: string;
  },
): Promise<void> {
  await conn.query(INSERT_FOLLOWUP_ITEM, [
    input.id,
    input.teamId,
    input.categoryId,
    input.titleId,
    input.statusText,
    input.completedByLabel,
    input.completedByMemberId,
    input.position,
    input.actorUserId,
    input.actorUserId,
  ]);
}

export async function countTeamFollowups(conn: DbClient, teamId: string): Promise<number> {
  const res = await conn.query<{ cnt: number }>(COUNT_FOLLOWUPS_BY_TEAM, [teamId]);
  return Number(res.rows[0]?.cnt ?? 0);
}

export async function updateFollowupItemOptimistic(
  conn: DbClient,
  input: {
    teamId: string;
    followupId: string;
    categoryId: string | null;
    titleId: string | null;
    status: FollowupStatus;
    statusText: string;
    completedByMemberId: string | null;
    completedByLabel: string | null;
    completedOn: string | null;
    actorUserId: string;
    expectedVersion: number;
  },
): Promise<boolean> {
  const res = await conn.query(UPDATE_FOLLOWUP_ITEM_OPTIMISTIC, [
    input.categoryId,
    input.titleId,
    input.status,
    input.statusText,
    input.completedByMemberId,
    input.completedByLabel,
    input.completedOn,
    input.actorUserId,
    input.teamId,
    input.followupId,
    input.expectedVersion,
  ]);
  return (res.rowCount ?? 0) === 1;
}

export async function updateFollowupPosition(
  conn: DbClient,
  teamId: string,
  followupId: string,
  position: number,
): Promise<void> {
  await conn.query(UPDATE_FOLLOWUP_POSITION, [position, teamId, followupId]);
}

export async function archiveFollowupItem(
  conn: DbClient,
  teamId: string,
  followupId: string,
  actorUserId: string,
): Promise<boolean> {
  const res = await conn.query(ARCHIVE_FOLLOWUP_ITEM, [actorUserId, teamId, followupId]);
  return (res.rowCount ?? 0) === 1;
}

export async function archiveAllFollowups(
  conn: DbClient,
  teamId: string,
  actorUserId: string,
): Promise<number> {
  const res = await conn.query(ARCHIVE_ALL_FOLLOWUPS, [actorUserId, teamId]);
  return res.rowCount ?? 0;
}
