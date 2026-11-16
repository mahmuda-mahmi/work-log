import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  DailyReportDto,
  FollowupStatus,
  NumberingMode,
  ReportFollowupDto,
  ReportStatus,
  WorkEntryDto,
  WorkGroupDto,
} from '@cghq/contracts';
import { sha256Hex } from '../../common/crypto.js';
import {
  BUMP_DAILY_REPORT_VERSION,
  COUNT_WORK_GROUPS_BY_REPORT,
  DELETE_DAILY_REPORT,
  DELETE_WORK_GROUP,
  INSERT_IGNORE_DAILY_REPORT,
  INSERT_WORK_ENTRY,
  INSERT_WORK_GROUP,
  SELECT_DAILY_REPORT_BY_DATE,
  SELECT_DAILY_REPORT_FOR_UPDATE,
  SELECT_FROZEN_FOLLOWUPS_FOR_REPORT,
  SELECT_GROUP_BY_REPORT_CAT_TITLE,
  SELECT_LIVE_FOLLOWUPS_FOR_DATE,
  SELECT_NEXT_ENTRY_POSITION,
  SELECT_NEXT_GROUP_POSITION,
  SELECT_WORK_ENTRIES_BY_REPORT,
  SELECT_WORK_ENTRY_FOR_EDIT,
  SELECT_WORK_GROUPS_BY_REPORT,
  SOFT_DELETE_WORK_ENTRY,
  UPDATE_WORK_ENTRY_OPTIMISTIC,
  UPDATE_WORK_ENTRY_POSITION,
  UPDATE_WORK_GROUP_CAT_TITLE,
  UPDATE_WORK_GROUP_NUMBERING,
  UPDATE_WORK_GROUP_POSITION,
} from '../sql/reports.sql.js';

type Conn = Pool | PoolConnection;

type GroupIdRow = RowDataPacket & { id: string };

type ReportRow = RowDataPacket & {
  id: string;
  team_id: string;
  report_date: string;
  status: ReportStatus;
  prepared_by_name: string;
  revision: number;
  version: number;
};

type GroupRow = RowDataPacket & {
  id: string;
  category_id: string;
  category_name: string;
  title_id: string;
  title_name: string;
  position: number;
  numbering_mode: NumberingMode;
};

type EntryRow = RowDataPacket & {
  id: string;
  group_id: string;
  status_text: string;
  completed_by_member_id: string | null;
  completed_by_label: string | null;
  member_display_name: string | null;
  position: number;
  version: number;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type EntryForEditRow = EntryRow & {
  report_id: string;
  team_id: string;
  report_status: ReportStatus;
};

type LiveFollowupRow = RowDataPacket & {
  id: string;
  category_name: string;
  title_name: string;
  status_text: string;
  completed_by_display: string;
  status: FollowupStatus;
};

type FrozenFollowupRow = RowDataPacket & {
  id: string;
  category_name: string;
  title_name: string;
  status_text: string;
  completed_by_display: string;
};

type IdPosRow = RowDataPacket & { id: string; position: number };
type NextPosRow = RowDataPacket & { next_pos: number };

function mapEntryRow(r: EntryRow): WorkEntryDto {
  return {
    id: r.id,
    groupId: r.group_id,
    statusText: r.status_text,
    completedByMemberId: r.completed_by_member_id,
    completedByLabel: r.completed_by_label,
    completedByDisplay: r.member_display_name ?? r.completed_by_label ?? '',
    position: r.position,
    version: r.version,
    createdByUserId: r.created_by_user_id,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function findReportByDate(conn: Conn, teamId: string, reportDate: string) {
  const [rows] = await conn.execute<ReportRow[]>(SELECT_DAILY_REPORT_BY_DATE, [teamId, reportDate]);
  return rows[0] ?? null;
}

export async function findReportForUpdate(conn: PoolConnection, teamId: string, reportDate: string) {
  const [rows] = await conn.execute<ReportRow[]>(SELECT_DAILY_REPORT_FOR_UPDATE, [
    teamId,
    reportDate,
  ]);
  return rows[0] ?? null;
}

export async function insertIgnoreDailyReport(
  conn: Conn,
  params: {
    id: string;
    teamId: string;
    reportDate: string;
    preparedByName: string;
    preparedByUserId: string;
  },
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(INSERT_IGNORE_DAILY_REPORT, [
    params.id,
    params.teamId,
    params.reportDate,
    params.preparedByName,
    params.preparedByUserId,
  ]);
  return res.affectedRows === 1;
}

export async function bumpDailyReportVersion(conn: Conn, reportId: string): Promise<void> {
  await conn.execute(BUMP_DAILY_REPORT_VERSION, [reportId]);
}

export async function assembleDailyReportDto(
  conn: Conn,
  report: ReportRow,
  todayDate: string,
): Promise<DailyReportDto> {
  const followupPromise =
    report.status === 'finalized'
      ? conn.execute<FrozenFollowupRow[]>(SELECT_FROZEN_FOLLOWUPS_FOR_REPORT, [report.id])
      : conn.execute<LiveFollowupRow[]>(SELECT_LIVE_FOLLOWUPS_FOR_DATE, [
          report.team_id,
          report.report_date,
        ]);

  const [[groupRows], [entryRows], [followupRows]] = await Promise.all([
    conn.execute<GroupRow[]>(SELECT_WORK_GROUPS_BY_REPORT, [report.id]),
    conn.execute<EntryRow[]>(SELECT_WORK_ENTRIES_BY_REPORT, [report.id]),
    followupPromise,
  ]);

  const entriesByGroup = new Map<string, WorkEntryDto[]>();
  for (const e of entryRows) {
    const list = entriesByGroup.get(e.group_id) ?? [];
    list.push(mapEntryRow(e));
    entriesByGroup.set(e.group_id, list);
  }

  const groups: WorkGroupDto[] = groupRows.map((g) => ({
    id: g.id,
    categoryId: g.category_id,
    categoryName: g.category_name,
    titleId: g.title_id,
    titleName: g.title_name,
    position: g.position,
    numberingMode: g.category_name.trim().toLowerCase() === 'support' ? g.numbering_mode : 'plain',
    entries: entriesByGroup.get(g.id) ?? [],
  }));

  const rawFollowups: ReportFollowupDto[] =
    report.status === 'finalized'
      ? (followupRows as FrozenFollowupRow[]).map((f) => ({
          id: f.id,
          categoryName: f.category_name,
          titleName: f.title_name,
          statusText: f.status_text,
          completedByDisplay: f.completed_by_display,
        }))
      : (followupRows as LiveFollowupRow[]).map((f) => ({
          id: f.id,
          categoryName: f.category_name,
          titleName: f.title_name,
          statusText: f.status_text,
          completedByDisplay: f.completed_by_display,
          status: f.status,
        }));

  const seenFollowupKeys = new Set<string>();
  const followups: ReportFollowupDto[] = [];
  for (const f of rawFollowups) {
    const key = `${f.categoryName.trim().toLowerCase()}\u0000${f.titleName.trim().toLowerCase()}\u0000${f.statusText.trim().toLowerCase()}`;
    if (!seenFollowupKeys.has(key)) {
      seenFollowupKeys.add(key);
      followups.push(f);
    }
  }

  const etag = `"${sha256Hex(
    JSON.stringify({
      id: report.id,
      status: report.status,
      version: report.version,
      revision: report.revision,
      todayDate,
      groups,
      followups,
    }),
  ).slice(0, 24)}"`;

  return {
    id: report.id,
    teamId: report.team_id,
    reportDate: report.report_date,
    todayDate,
    status: report.status,
    preparedByName: report.prepared_by_name,
    revision: report.revision,
    version: report.version,
    etag,
    groups,
    followups,
  };
}

export async function findOrCreateWorkGroup(
  conn: PoolConnection,
  params: {
    groupId: string;
    reportId: string;
    categoryId: string;
    titleId: string;
    numberingMode?: NumberingMode;
    createdByUserId: string;
  },
): Promise<string> {
  const [existing] = await conn.execute<IdPosRow[]>(SELECT_GROUP_BY_REPORT_CAT_TITLE, [
    params.reportId,
    params.categoryId,
    params.titleId,
  ]);
  if (existing[0]) {
    return existing[0].id;
  }

  const [posRows] = await conn.execute<NextPosRow[]>(SELECT_NEXT_GROUP_POSITION, [params.reportId]);
  const nextPos = Number(posRows[0]?.next_pos ?? 10);
  await conn.execute(INSERT_WORK_GROUP, [
    params.groupId,
    params.reportId,
    params.categoryId,
    params.titleId,
    nextPos,
    params.numberingMode ?? 'plain',
    params.createdByUserId,
  ]);
  return params.groupId;
}

export async function getNextEntryPosition(conn: PoolConnection, groupId: string): Promise<number> {
  const [rows] = await conn.execute<NextPosRow[]>(SELECT_NEXT_ENTRY_POSITION, [groupId]);
  return Number(rows[0]?.next_pos ?? 10);
}

export async function insertWorkEntry(
  conn: PoolConnection,
  params: {
    id: string;
    groupId: string;
    statusText: string;
    completedByMemberId: string | null;
    completedByLabel: string | null;
    position: number;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.execute(INSERT_WORK_ENTRY, [
    params.id,
    params.groupId,
    params.statusText,
    params.completedByMemberId,
    params.completedByLabel,
    params.position,
    params.createdByUserId,
    params.createdByUserId,
  ]);
}

export async function findWorkEntryForEdit(
  conn: PoolConnection,
  entryId: string,
  teamId: string,
) {
  const [rows] = await conn.execute<EntryForEditRow[]>(SELECT_WORK_ENTRY_FOR_EDIT, [
    entryId,
    teamId,
  ]);
  const r = rows[0];
  if (!r) return null;
  return {
    entry: mapEntryRow(r),
    reportId: r.report_id,
    teamId: r.team_id,
    reportStatus: r.report_status,
  };
}

export async function updateWorkEntryOptimistic(
  conn: PoolConnection,
  params: {
    entryId: string;
    statusText: string;
    completedByMemberId: string | null;
    completedByLabel: string | null;
    expectedVersion: number;
    updatedByUserId: string;
  },
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_WORK_ENTRY_OPTIMISTIC, [
    params.statusText,
    params.completedByMemberId,
    params.completedByLabel,
    params.updatedByUserId,
    params.entryId,
    params.expectedVersion,
  ]);
  return res.affectedRows === 1;
}

export async function softDeleteWorkEntry(
  conn: PoolConnection,
  entryId: string,
  updatedByUserId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(SOFT_DELETE_WORK_ENTRY, [
    updatedByUserId,
    entryId,
  ]);
  return res.affectedRows === 1;
}

export async function updateWorkGroupPosition(
  conn: PoolConnection,
  reportId: string,
  groupId: string,
  position: number,
): Promise<void> {
  await conn.execute(UPDATE_WORK_GROUP_POSITION, [position, groupId, reportId]);
}

export async function updateWorkEntryPosition(
  conn: PoolConnection,
  groupId: string,
  entryId: string,
  position: number,
): Promise<void> {
  await conn.execute(UPDATE_WORK_ENTRY_POSITION, [position, entryId, groupId]);
}

export async function updateWorkGroupNumbering(
  conn: Conn,
  teamId: string,
  reportId: string,
  groupId: string,
  numberingMode: NumberingMode,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_WORK_GROUP_NUMBERING, [
    numberingMode,
    groupId,
    reportId,
    teamId,
  ]);
  return res.affectedRows === 1;
}

export async function countWorkGroupsByReport(conn: Conn, reportId: string): Promise<number> {
  const [rows] = await conn.execute<(RowDataPacket & { cnt: number })[]>(
    COUNT_WORK_GROUPS_BY_REPORT,
    [reportId],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function insertWorkGroupAtPosition(
  conn: PoolConnection,
  input: {
    id: string;
    reportId: string;
    categoryId: string;
    titleId: string;
    position: number;
    numberingMode?: NumberingMode;
    actorUserId: string;
  },
): Promise<void> {
  const [existing] = await conn.execute<GroupIdRow[]>(SELECT_GROUP_BY_REPORT_CAT_TITLE, [
    input.reportId,
    input.categoryId,
    input.titleId,
  ]);
  if (existing[0]) return;
  await conn.execute(INSERT_WORK_GROUP, [
    input.id,
    input.reportId,
    input.categoryId,
    input.titleId,
    input.position,
    input.numberingMode ?? 'plain',
    input.actorUserId,
  ]);
}

export async function updateWorkGroupCategoryTitle(
  conn: PoolConnection,
  reportId: string,
  groupId: string,
  categoryId: string,
  titleId: string,
): Promise<{ ok: boolean; duplicate: boolean }> {
  const [existing] = await conn.execute<GroupIdRow[]>(SELECT_GROUP_BY_REPORT_CAT_TITLE, [
    reportId,
    categoryId,
    titleId,
  ]);
  if (existing[0] && existing[0].id !== groupId) {
    return { ok: false, duplicate: true };
  }
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_WORK_GROUP_CAT_TITLE, [
    categoryId,
    titleId,
    groupId,
    reportId,
  ]);
  return { ok: res.affectedRows === 1, duplicate: false };
}

export async function deleteWorkGroup(
  conn: PoolConnection,
  reportId: string,
  groupId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(DELETE_WORK_GROUP, [groupId, reportId]);
  return res.affectedRows === 1;
}

export async function deleteDailyReport(
  conn: PoolConnection,
  teamId: string,
  reportId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(DELETE_DAILY_REPORT, [reportId, teamId]);
  return res.affectedRows === 1;
}
