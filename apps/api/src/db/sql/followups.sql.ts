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
    AND ($2::boolean = TRUE OR fi.status <> 'archived')
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
    TO_CHAR(fi.completed_on, 'YYYY-MM-DD') AS completed_on,
    fi.position,
    fi.version,
    fi.created_at,
    fi.updated_at
  FROM followup_items fi
  LEFT JOIN categories c ON c.id = fi.category_id
  LEFT JOIN titles t ON t.id = fi.title_id
  LEFT JOIN team_members tm ON tm.id = fi.completed_by_member_id
  WHERE fi.team_id = $1 AND fi.id = $2
  LIMIT 1
`;

export const SELECT_NEXT_FOLLOWUP_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 1000 AS next_pos
  FROM followup_items
  WHERE team_id = $1
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
  VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, 1, $9, $10)
`;

export const UPDATE_FOLLOWUP_ITEM_OPTIMISTIC = `
  UPDATE followup_items
  SET
    category_id = $1,
    title_id = $2,
    status = $3,
    status_text = $4,
    completed_by_member_id = $5,
    completed_by_label = $6,
    completed_on = $7,
    updated_by_user_id = $8,
    version = version + 1
  WHERE team_id = $9 AND id = $10 AND version = $11
`;

export const COUNT_FOLLOWUPS_BY_TEAM = `
  SELECT COUNT(*)::int AS cnt
  FROM followup_items
  WHERE team_id = $1
`;

export const UPDATE_FOLLOWUP_POSITION = `
  UPDATE followup_items
  SET position = $1
  WHERE team_id = $2 AND id = $3
`;

export const ARCHIVE_FOLLOWUP_ITEM = `
  UPDATE followup_items
  SET status = 'archived', updated_by_user_id = $1, version = version + 1
  WHERE team_id = $2 AND id = $3
`;
