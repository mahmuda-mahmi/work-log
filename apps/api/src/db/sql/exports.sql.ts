export const FINALIZE_DAILY_REPORT = `
  UPDATE daily_reports
  SET
    status = 'finalized',
    prepared_by_name = ?,
    revision = revision + 1,
    version = version + 1,
    finalized_at = NOW(3),
    finalized_by_user_id = ?
  WHERE id = ? AND status IN ('draft', 'reopened')
`;

export const REOPEN_DAILY_REPORT = `
  UPDATE daily_reports
  SET
    status = 'reopened',
    version = version + 1
  WHERE id = ? AND status = 'finalized'
`;

export const DELETE_FROZEN_FOLLOWUPS_FOR_REPORT = `
  DELETE FROM report_followups
  WHERE report_id = ?
`;

export const INSERT_FROZEN_REPORT_FOLLOWUP = `
  INSERT INTO report_followups (
    id,
    report_id,
    followup_item_id,
    category_name,
    title_name,
    status_text,
    completed_by_text,
    position,
    is_included
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
`;

export const INSERT_REPORT_SNAPSHOT = `
  INSERT INTO report_snapshots (
    id,
    report_id,
    revision,
    schema_version,
    renderer_version,
    payload,
    content_hash,
    created_by_user_id
  )
  VALUES (?, ?, ?, 1, '1.0.0', ?, ?, ?)
`;

export const SELECT_LATEST_SNAPSHOT_FOR_REPORT = `
  SELECT
    id,
    report_id,
    revision,
    payload,
    content_hash,
    created_at
  FROM report_snapshots
  WHERE report_id = ?
  ORDER BY revision DESC
  LIMIT 1
`;

export const SELECT_REPORT_HISTORY = `
  SELECT
    dr.id,
    DATE_FORMAT(dr.report_date, '%Y-%m-%d') AS report_date,
    dr.status,
    dr.revision,
    dr.prepared_by_name,
    dr.finalized_at,
    dr.updated_at,
    (
      SELECT COUNT(*)
      FROM work_entries we
      INNER JOIN work_groups wg ON wg.id = we.group_id
      WHERE wg.report_id = dr.id AND we.deleted_at IS NULL
    ) AS entry_count,
    (
      SELECT COUNT(*)
      FROM report_exports re
      WHERE re.report_id = dr.id
    ) AS export_count
  FROM daily_reports dr
  WHERE dr.team_id = ?
  ORDER BY dr.report_date DESC
  LIMIT 90
`;

export const SELECT_EXPORT_BY_SNAPSHOT_FORMAT = `
  SELECT
    id,
    report_id,
    snapshot_id,
    format,
    file_name,
    storage_key,
    byte_size,
    sha256,
    download_count,
    created_at
  FROM report_exports
  WHERE snapshot_id = ? AND format = ?
  LIMIT 1
`;

export const SELECT_EXPORTS_FOR_REPORT = `
  SELECT
    re.id,
    re.format,
    re.file_name,
    re.byte_size,
    re.download_count,
    re.created_at
  FROM report_exports re
  INNER JOIN report_snapshots rs ON rs.id = re.snapshot_id
  WHERE re.report_id = ?
    AND rs.revision = (
      SELECT MAX(rs2.revision) FROM report_snapshots rs2 WHERE rs2.report_id = re.report_id
    )
  ORDER BY re.created_at DESC
`;

export const INSERT_REPORT_EXPORT = `
  INSERT INTO report_exports (
    id,
    report_id,
    snapshot_id,
    format,
    file_name,
    storage_key,
    byte_size,
    sha256,
    download_count,
    created_by_user_id
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
`;

export const INCREMENT_EXPORT_DOWNLOAD_COUNT = `
  UPDATE report_exports
  SET download_count = download_count + 1
  WHERE id = ?
`;
