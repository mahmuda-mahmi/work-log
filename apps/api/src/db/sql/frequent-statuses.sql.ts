export const SELECT_FREQUENT_STATUSES_BY_TEAM = `
  SELECT id, status_text, position, title_ids
  FROM frequent_statuses
  WHERE team_id = $1
  ORDER BY position ASC, created_at ASC
`;

export const SELECT_NEXT_FREQUENT_STATUS_POS = `
  SELECT COALESCE(MAX(position), 0) + 1000 AS next_pos
  FROM frequent_statuses
  WHERE team_id = $1
`;

export const INSERT_FREQUENT_STATUS = `
  INSERT INTO frequent_statuses (id, team_id, status_text, position, title_ids, created_by)
  VALUES ($1, $2, $3, $4, $5, $6)
`;

export const UPDATE_FREQUENT_STATUS = `
  UPDATE frequent_statuses
  SET status_text = $1,
      title_ids = COALESCE($2, title_ids),
      updated_at = NOW()
  WHERE id = $3 AND team_id = $4
  RETURNING id, status_text, position, title_ids
`;

export const DELETE_FREQUENT_STATUS = `
  DELETE FROM frequent_statuses
  WHERE id = $1 AND team_id = $2
`;
