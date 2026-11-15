export const INSERT_IGNORE_DAILY_REPORT = `
  INSERT IGNORE INTO daily_reports (id, team_id, report_date, status, prepared_by_name, prepared_by_user_id, revision, version)
  VALUES (?, ?, ?, 'draft', ?, ?, 0, 1)
`;

export const SELECT_DAILY_REPORT_BY_DATE = `
  SELECT
    id,
    team_id,
    DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date,
    status,
    prepared_by_name,
    revision,
    version
  FROM daily_reports
  WHERE team_id = ? AND report_date = ?
  LIMIT 1
`;

export const SELECT_DAILY_REPORT_FOR_UPDATE = `
  SELECT
    id,
    team_id,
    DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date,
    status,
    prepared_by_name,
    revision,
    version
  FROM daily_reports
  WHERE team_id = ? AND report_date = ?
  LIMIT 1
  FOR UPDATE
`;

export const BUMP_DAILY_REPORT_VERSION = `
  UPDATE daily_reports
  SET version = version + 1
  WHERE id = ?
`;

export const SELECT_WORK_GROUPS_BY_REPORT = `
  SELECT
    wg.id,
    wg.category_id,
    c.name AS category_name,
    wg.title_id,
    t.name AS title_name,
    wg.position,
    wg.numbering_mode
  FROM work_groups wg
  INNER JOIN categories c ON c.id = wg.category_id
  INNER JOIN titles t ON t.id = wg.title_id
  WHERE wg.report_id = ?
  ORDER BY wg.position ASC, wg.created_at ASC, wg.id ASC
`;

export const SELECT_WORK_ENTRIES_BY_REPORT = `
  SELECT
    we.id,
    we.group_id,
    we.status_text,
    we.completed_by_member_id,
    we.completed_by_label,
    tm.display_name AS member_display_name,
    we.position,
    we.version,
    we.created_by_user_id,
    we.created_at,
    we.updated_at
  FROM work_entries we
  INNER JOIN work_groups wg ON wg.id = we.group_id
  LEFT JOIN team_members tm ON tm.id = we.completed_by_member_id
  WHERE wg.report_id = ? AND we.deleted_at IS NULL
  ORDER BY wg.position ASC, we.position ASC, we.created_at ASC, we.id ASC
`;

export const SELECT_GROUP_BY_REPORT_CAT_TITLE = `
  SELECT id, position
  FROM work_groups
  WHERE report_id = ? AND category_id = ? AND title_id = ?
  LIMIT 1
  FOR UPDATE
`;

export const SELECT_NEXT_GROUP_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM work_groups
  WHERE report_id = ?
`;

export const INSERT_WORK_GROUP = `
  INSERT INTO work_groups (id, report_id, category_id, title_id, position, numbering_mode, created_by_user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const COUNT_WORK_GROUPS_BY_REPORT = `
  SELECT COUNT(*) AS cnt
  FROM work_groups
  WHERE report_id = ?
`;

export const UPDATE_WORK_GROUP_CAT_TITLE = `
  UPDATE work_groups
  SET category_id = ?, title_id = ?
  WHERE id = ? AND report_id = ?
`;

export const DELETE_WORK_GROUP = `
  DELETE FROM work_groups
  WHERE id = ? AND report_id = ?
`;

export const DELETE_DAILY_REPORT = `
  DELETE FROM daily_reports
  WHERE id = ? AND team_id = ?
`;

export const SELECT_NEXT_ENTRY_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM work_entries
  WHERE group_id = ? AND deleted_at IS NULL
`;

export const INSERT_WORK_ENTRY = `
  INSERT INTO work_entries (
    id, group_id, status_text, completed_by_member_id, completed_by_label,
    position, version, created_by_user_id, updated_by_user_id
  )
  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
`;

export const SELECT_WORK_ENTRY_FOR_EDIT = `
  SELECT
    we.id,
    we.group_id,
    we.status_text,
    we.completed_by_member_id,
    we.completed_by_label,
    tm.display_name AS member_display_name,
    we.position,
    we.version,
    we.created_by_user_id,
    we.created_at,
    we.updated_at,
    dr.id AS report_id,
    dr.team_id,
    dr.status AS report_status
  FROM work_entries we
  INNER JOIN work_groups wg ON wg.id = we.group_id
  INNER JOIN daily_reports dr ON dr.id = wg.report_id
  LEFT JOIN team_members tm ON tm.id = we.completed_by_member_id
  WHERE we.id = ? AND dr.team_id = ? AND we.deleted_at IS NULL
  LIMIT 1
  FOR UPDATE
`;

export const UPDATE_WORK_ENTRY_OPTIMISTIC = `
  UPDATE work_entries
  SET
    status_text = ?,
    completed_by_member_id = ?,
    completed_by_label = ?,
    version = version + 1,
    updated_by_user_id = ?
  WHERE id = ? AND version = ? AND deleted_at IS NULL
`;

export const SOFT_DELETE_WORK_ENTRY = `
  UPDATE work_entries
  SET deleted_at = UTC_TIMESTAMP(3), updated_by_user_id = ?
  WHERE id = ? AND deleted_at IS NULL
`;

export const UPDATE_WORK_GROUP_POSITION = `
  UPDATE work_groups
  SET position = ?
  WHERE id = ? AND report_id = ?
`;

export const UPDATE_WORK_GROUP_NUMBERING = `
  UPDATE work_groups wg
  INNER JOIN daily_reports dr ON dr.id = wg.report_id
  SET wg.numbering_mode = ?
  WHERE wg.id = ? AND wg.report_id = ? AND dr.team_id = ?
`;

export const UPDATE_WORK_ENTRY_POSITION = `
  UPDATE work_entries
  SET position = ?
  WHERE id = ? AND group_id = ? AND deleted_at IS NULL
`;

export const SELECT_LIVE_FOLLOWUPS_FOR_DATE = `
  SELECT
    fi.id,
    COALESCE(c.name, '') AS category_name,
    COALESCE(t.name, 'Follow-up') AS title_name,
    fi.status_text,
    COALESCE(tm.display_name, fi.completed_by_label, '') AS completed_by_display,
    fi.status
  FROM followup_items fi
  LEFT JOIN categories c ON c.id = fi.category_id
  LEFT JOIN titles t ON t.id = fi.title_id
  LEFT JOIN team_members tm ON tm.id = fi.completed_by_member_id
  WHERE fi.team_id = ?
    AND (fi.status IN ('open', 'in_progress') OR (fi.status = 'done' AND fi.completed_on = ?))
  ORDER BY fi.position ASC, fi.created_at ASC, fi.id ASC
`;

export const SELECT_FROZEN_FOLLOWUPS_FOR_REPORT = `
  SELECT
    id,
    category_name,
    title_name,
    status_text,
    completed_by_text AS completed_by_display
  FROM report_followups
  WHERE report_id = ? AND is_included = 1
  ORDER BY position ASC, created_at ASC, id ASC
`;
