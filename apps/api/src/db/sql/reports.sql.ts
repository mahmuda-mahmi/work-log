export const INSERT_IGNORE_DAILY_REPORT = `
  INSERT INTO daily_reports (id, team_id, report_date, status, prepared_by_name, prepared_by_user_id, revision, version)
  VALUES ($1, $2, $3, 'draft', $4, $5, 0, 1)
  ON CONFLICT (team_id, report_date) DO NOTHING
`;

export const SELECT_DAILY_REPORT_BY_DATE = `
  SELECT
    id,
    team_id,
    TO_CHAR(report_date, 'YYYY-MM-DD') AS report_date,
    status,
    prepared_by_name,
    revision,
    version
  FROM daily_reports
  WHERE team_id = $1 AND report_date = $2
  LIMIT 1
`;

export const SELECT_DAILY_REPORT_FOR_UPDATE = `
  SELECT
    id,
    team_id,
    TO_CHAR(report_date, 'YYYY-MM-DD') AS report_date,
    status,
    prepared_by_name,
    revision,
    version
  FROM daily_reports
  WHERE team_id = $1 AND report_date = $2
  LIMIT 1
  FOR UPDATE
`;

export const BUMP_DAILY_REPORT_VERSION = `
  UPDATE daily_reports
  SET version = version + 1
  WHERE id = $1
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
  WHERE wg.report_id = $1
  ORDER BY wg.position ASC, wg.created_at ASC, wg.id ASC
`;

export const SELECT_EMPTY_COMMUNICATION_GROUPS_BY_REPORT = `
  SELECT wg.id
  FROM work_groups wg
  INNER JOIN categories c ON c.id = wg.category_id
  WHERE wg.report_id = $1
    AND LOWER(TRIM(c.name)) = 'communication'
    AND NOT EXISTS (
      SELECT 1 FROM work_entries we
      WHERE we.group_id = wg.id AND we.deleted_at IS NULL
    )
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
  WHERE wg.report_id = $1 AND we.deleted_at IS NULL
  ORDER BY wg.position ASC, we.position ASC, we.created_at ASC, we.id ASC
`;

export const SELECT_GROUP_BY_REPORT_CAT_TITLE = `
  SELECT id, position
  FROM work_groups
  WHERE report_id = $1 AND category_id = $2 AND title_id = $3
  LIMIT 1
  FOR UPDATE
`;

export const SELECT_NEXT_GROUP_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM work_groups
  WHERE report_id = $1
`;

export const INSERT_WORK_GROUP = `
  INSERT INTO work_groups (id, report_id, category_id, title_id, position, numbering_mode, created_by_user_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

export const COUNT_WORK_GROUPS_BY_REPORT = `
  SELECT COUNT(*)::int AS cnt
  FROM work_groups
  WHERE report_id = $1
`;

export const UPDATE_WORK_GROUP_CAT_TITLE = `
  UPDATE work_groups
  SET category_id = $1, title_id = $2
  WHERE id = $3 AND report_id = $4
`;

export const DELETE_WORK_GROUP = `
  DELETE FROM work_groups
  WHERE id = $1 AND report_id = $2
`;

export const DELETE_DAILY_REPORT = `
  DELETE FROM daily_reports
  WHERE id = $1 AND team_id = $2
`;

export const SELECT_NEXT_ENTRY_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM work_entries
  WHERE group_id = $1 AND deleted_at IS NULL
`;

export const INSERT_WORK_ENTRY = `
  INSERT INTO work_entries (
    id, group_id, status_text, completed_by_member_id, completed_by_label,
    position, version, created_by_user_id, updated_by_user_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
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
  WHERE we.id = $1 AND dr.team_id = $2 AND we.deleted_at IS NULL
  LIMIT 1
  FOR UPDATE OF we
`;

export const UPDATE_WORK_ENTRY_OPTIMISTIC = `
  UPDATE work_entries
  SET
    status_text = $1,
    completed_by_member_id = $2,
    completed_by_label = $3,
    version = version + 1,
    updated_by_user_id = $4
  WHERE id = $5 AND version = $6 AND deleted_at IS NULL
`;

export const SOFT_DELETE_WORK_ENTRY = `
  UPDATE work_entries
  SET deleted_at = NOW(), updated_by_user_id = $1
  WHERE id = $2 AND deleted_at IS NULL
`;

export const UPDATE_WORK_GROUP_POSITION = `
  UPDATE work_groups
  SET position = $1
  WHERE id = $2 AND report_id = $3
`;

export const UPDATE_WORK_GROUP_NUMBERING = `
  UPDATE work_groups wg
  SET numbering_mode = $1
  FROM daily_reports dr
  WHERE dr.id = wg.report_id AND wg.id = $2 AND wg.report_id = $3 AND dr.team_id = $4
`;

export const UPDATE_WORK_ENTRY_POSITION = `
  UPDATE work_entries
  SET position = $1
  WHERE id = $2 AND group_id = $3 AND deleted_at IS NULL
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
  WHERE fi.team_id = $1
    AND (fi.status IN ('open', 'in_progress') OR (fi.status = 'done' AND fi.completed_on = $2))
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
  WHERE report_id = $1 AND is_included = TRUE
  ORDER BY position ASC, created_at ASC, id ASC
`;
