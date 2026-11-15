import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ExportFormat,
  ReportExportInfo,
  ReportHistoryItem,
  ReportStatus,
} from '@cghq/contracts';
import {
  DELETE_FROZEN_FOLLOWUPS_FOR_REPORT,
  FINALIZE_DAILY_REPORT,
  INCREMENT_EXPORT_DOWNLOAD_COUNT,
  INSERT_FROZEN_REPORT_FOLLOWUP,
  INSERT_REPORT_EXPORT,
  INSERT_REPORT_SNAPSHOT,
  REOPEN_DAILY_REPORT,
  SELECT_EXPORTS_FOR_REPORT,
  SELECT_EXPORT_BY_SNAPSHOT_FORMAT,
  SELECT_LATEST_SNAPSHOT_FOR_REPORT,
  SELECT_REPORT_HISTORY,
} from '../sql/exports.sql.js';

type Conn = Pool | PoolConnection;

type HistoryRow = RowDataPacket & {
  id: string;
  report_date: string;
  status: ReportStatus;
  revision: number;
  prepared_by_name: string;
  finalized_at: Date | string | null;
  updated_at: Date | string;
  entry_count: number;
  export_count: number;
};

type SnapshotRow = RowDataPacket & {
  id: string;
  report_id: string;
  revision: number;
  payload: string | Record<string, unknown>;
  content_hash: string;
  created_at: Date | string;
};

type ExportRow = RowDataPacket & {
  id: string;
  report_id: string;
  snapshot_id: string;
  format: ExportFormat;
  file_name: string;
  storage_key: string;
  byte_size: number;
  sha256: string;
  download_count: number;
  created_at: Date | string;
};

type ExportInfoRow = RowDataPacket & {
  id: string;
  format: ExportFormat;
  file_name: string;
  byte_size: number;
  download_count: number;
  created_at: Date | string;
};

function toIso(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

export async function finalizeDailyReportRow(
  conn: Conn,
  reportId: string,
  preparedByName: string,
  actorUserId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(FINALIZE_DAILY_REPORT, [
    preparedByName,
    actorUserId,
    reportId,
  ]);
  return res.affectedRows === 1;
}

export async function reopenDailyReportRow(conn: Conn, reportId: string): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(REOPEN_DAILY_REPORT, [reportId]);
  return res.affectedRows === 1;
}

export async function deleteFrozenFollowups(conn: Conn, reportId: string): Promise<void> {
  await conn.execute(DELETE_FROZEN_FOLLOWUPS_FOR_REPORT, [reportId]);
}

export async function insertFrozenFollowup(
  conn: Conn,
  input: {
    id: string;
    reportId: string;
    followupItemId: string;
    categoryName: string;
    titleName: string;
    statusText: string;
    completedByText: string;
    position: number;
  },
): Promise<void> {
  await conn.execute(INSERT_FROZEN_REPORT_FOLLOWUP, [
    input.id,
    input.reportId,
    input.followupItemId,
    input.categoryName,
    input.titleName,
    input.statusText,
    input.completedByText,
    input.position,
  ]);
}

export async function insertReportSnapshot(
  conn: Conn,
  input: {
    id: string;
    reportId: string;
    revision: number;
    payloadJson: string;
    contentHash: string;
    actorUserId: string;
  },
): Promise<void> {
  await conn.execute(INSERT_REPORT_SNAPSHOT, [
    input.id,
    input.reportId,
    input.revision,
    input.payloadJson,
    input.contentHash,
    input.actorUserId,
  ]);
}

export async function findLatestSnapshotForReport(conn: Conn, reportId: string) {
  const [rows] = await conn.execute<SnapshotRow[]>(SELECT_LATEST_SNAPSHOT_FOR_REPORT, [
    reportId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    reportId: row.report_id,
    revision: row.revision,
    payload:
      typeof row.payload === 'string' ? (JSON.parse(row.payload) as Record<string, unknown>) : row.payload,
    contentHash: row.content_hash,
    createdAt: toIso(row.created_at),
  };
}

export async function listReportHistory(
  conn: Conn,
  teamId: string,
): Promise<ReportHistoryItem[]> {
  const [rows] = await conn.execute<HistoryRow[]>(SELECT_REPORT_HISTORY, [teamId]);
  return rows.map((r) => ({
    id: r.id,
    reportDate: r.report_date,
    status: r.status,
    revision: r.revision,
    preparedByName: r.prepared_by_name,
    entryCount: Number(r.entry_count),
    exportCount: Number(r.export_count),
    finalizedAt: r.finalized_at ? toIso(r.finalized_at) : null,
    updatedAt: toIso(r.updated_at),
  }));
}

export async function findExportBySnapshotAndFormat(
  conn: Conn,
  snapshotId: string,
  format: ExportFormat,
) {
  const [rows] = await conn.execute<ExportRow[]>(SELECT_EXPORT_BY_SNAPSHOT_FORMAT, [
    snapshotId,
    format,
  ]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    reportId: r.report_id,
    snapshotId: r.snapshot_id,
    format: r.format,
    fileName: r.file_name,
    storageKey: r.storage_key,
    byteSize: Number(r.byte_size),
    sha256: r.sha256,
    downloadCount: Number(r.download_count),
    createdAt: toIso(r.created_at),
  };
}

export async function listExportsForReport(
  conn: Conn,
  reportId: string,
): Promise<ReportExportInfo[]> {
  const [rows] = await conn.execute<ExportInfoRow[]>(SELECT_EXPORTS_FOR_REPORT, [reportId]);
  return rows.map((r) => ({
    id: r.id,
    format: r.format,
    fileName: r.file_name,
    byteSize: Number(r.byte_size),
    downloadCount: Number(r.download_count),
    createdAt: toIso(r.created_at),
  }));
}

export async function insertReportExport(
  conn: Conn,
  input: {
    id: string;
    reportId: string;
    snapshotId: string;
    format: ExportFormat;
    fileName: string;
    storageKey: string;
    byteSize: number;
    sha256: string;
    actorUserId: string;
  },
): Promise<void> {
  await conn.execute(INSERT_REPORT_EXPORT, [
    input.id,
    input.reportId,
    input.snapshotId,
    input.format,
    input.fileName,
    input.storageKey,
    input.byteSize,
    input.sha256,
    input.actorUserId,
  ]);
}

export async function incrementExportDownloadCount(conn: Conn, exportId: string): Promise<void> {
  await conn.execute(INCREMENT_EXPORT_DOWNLOAD_COUNT, [exportId]);
}
