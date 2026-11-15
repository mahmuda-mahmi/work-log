import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { FollowupItemDto, FollowupStatus } from '@cghq/contracts';
import {
  ARCHIVE_FOLLOWUP_ITEM,
  COUNT_FOLLOWUPS_BY_TEAM,
  INSERT_FOLLOWUP_ITEM,
  SELECT_FOLLOWUPS_BY_TEAM,
  SELECT_FOLLOWUP_BY_ID,
  SELECT_NEXT_FOLLOWUP_POSITION,
  UPDATE_FOLLOWUP_ITEM_OPTIMISTIC,
  UPDATE_FOLLOWUP_POSITION,
} from '../sql/followups.sql.js';

type Conn = Pool | PoolConnection;

type FollowupRow = RowDataPacket & {
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

export async function listTeamFollowups(
  conn: Conn,
  teamId: string,
  includeArchived = false,
): Promise<FollowupItemDto[]> {
  const [rows] = await conn.execute<FollowupRow[]>(SELECT_FOLLOWUPS_BY_TEAM, [
    teamId,
    includeArchived ? 1 : 0,
  ]);
  return rows.map(mapFollowupRow);
}

export async function findFollowupById(
  conn: Conn,
  teamId: string,
  followupId: string,
): Promise<FollowupItemDto | null> {
  const [rows] = await conn.execute<FollowupRow[]>(SELECT_FOLLOWUP_BY_ID, [teamId, followupId]);
  return rows[0] ? mapFollowupRow(rows[0]) : null;
}

export async function getNextFollowupPosition(conn: Conn, teamId: string): Promise<number> {
  const [rows] = await conn.execute<(RowDataPacket & { next_pos: number })[]>(
    SELECT_NEXT_FOLLOWUP_POSITION,
    [teamId],
  );
  return Number(rows[0]?.next_pos ?? 1000);
}

export async function insertFollowupItem(
  conn: Conn,
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
  await conn.execute(INSERT_FOLLOWUP_ITEM, [
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

export async function countTeamFollowups(conn: Conn, teamId: string): Promise<number> {
  const [rows] = await conn.execute<(RowDataPacket & { cnt: number })[]>(
    COUNT_FOLLOWUPS_BY_TEAM,
    [teamId],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function updateFollowupItemOptimistic(
  conn: Conn,
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
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_FOLLOWUP_ITEM_OPTIMISTIC, [
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
  return res.affectedRows === 1;
}

export async function updateFollowupPosition(
  conn: Conn,
  teamId: string,
  followupId: string,
  position: number,
): Promise<void> {
  await conn.execute(UPDATE_FOLLOWUP_POSITION, [position, teamId, followupId]);
}

export async function archiveFollowupItem(
  conn: Conn,
  teamId: string,
  followupId: string,
  actorUserId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(ARCHIVE_FOLLOWUP_ITEM, [
    actorUserId,
    teamId,
    followupId,
  ]);
  return res.affectedRows === 1;
}
