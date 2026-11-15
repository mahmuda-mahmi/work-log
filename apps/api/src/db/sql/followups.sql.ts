export const SELECT_FOLLOWUPS_BY_TEAM = `
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
    DATE_FORMAT(fi.completed_on, '%Y-%m-%d') AS completed_on,
    fi.position,
    fi.version,
    fi.created_at,
    fi.updated_at
  FROM followup_items fi
  LEFT JOIN categories c ON c.id = fi.category_id
  LEFT JOIN titles t ON t.id = fi.title_id
  LEFT JOIN team_members tm ON tm.id = fi.completed_by_member_id
  WHERE fi.team_id = ?
    AND (? = 1 OR fi.status <> 'archived')
  ORDER BY
    CASE fi.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 ELSE 4 END ASC,
    fi.position ASC,
    fi.created_at ASC
`;

export const SELECT_FOLLOWUP_BY_ID = `
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
    DATE_FORMAT(fi.completed_on, '%Y-%m-%d') AS completed_on,
    fi.position,
    fi.version,
    fi.created_at,
    fi.updated_at
  FROM followup_items fi
  LEFT JOIN categories c ON c.id = fi.category_id
  LEFT JOIN titles t ON t.id = fi.title_id
  LEFT JOIN team_members tm ON tm.id = fi.completed_by_member_id
  WHERE fi.team_id = ? AND fi.id = ?
  LIMIT 1
`;

export const SELECT_NEXT_FOLLOWUP_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 1000 AS next_pos
  FROM followup_items
  WHERE team_id = ?
`;

export const INSERT_FOLLOWUP_ITEM = `
  INSERT INTO followup_items (
    id,
    team_id,
    category_id,
    title_id,
    status,
    status_text,
    completed_by_label,
    completed_by_member_id,
    position,
    version,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, 1, ?, ?)
`;

export const UPDATE_FOLLOWUP_ITEM_OPTIMISTIC = `
  UPDATE followup_items
  SET
    category_id = ?,
    title_id = ?,
    status = ?,
    status_text = ?,
    completed_by_member_id = ?,
    completed_by_label = ?,
    completed_on = ?,
    updated_by_user_id = ?,
    version = version + 1
  WHERE team_id = ? AND id = ? AND version = ?
`;

export const COUNT_FOLLOWUPS_BY_TEAM = `
  SELECT COUNT(*) AS cnt
  FROM followup_items
  WHERE team_id = ?
`;

export const UPDATE_FOLLOWUP_POSITION = `
  UPDATE followup_items
  SET position = ?
  WHERE team_id = ? AND id = ?
`;

export const ARCHIVE_FOLLOWUP_ITEM = `
  UPDATE followup_items
  SET status = 'archived', updated_by_user_id = ?, version = version + 1
  WHERE team_id = ? AND id = ?
`;
