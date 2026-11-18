export const SELECT_CATEGORIES_BY_TEAM = `
  SELECT id, name, position, is_active
  FROM categories
  WHERE team_id = $1
  ORDER BY is_active DESC, position ASC, name ASC
`;

export const SELECT_TITLES_BY_TEAM = `
  SELECT id, category_id, name, position, is_active, scope
  FROM titles
  WHERE team_id = $1
  ORDER BY is_active DESC, position ASC, name ASC
`;

export const SELECT_CATEGORY_BY_NAME = `
  SELECT id, name, is_active
  FROM categories
  WHERE team_id = $1 AND LOWER(name) = LOWER($2)
  LIMIT 1
`;

export const INSERT_CATEGORY = `
  INSERT INTO categories (id, team_id, name, position, is_active)
  VALUES ($1, $2, $3, $4, TRUE)
  ON CONFLICT DO NOTHING
`;

export const SELECT_NEXT_CATEGORY_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM categories
  WHERE team_id = $1
`;

export const SELECT_TITLE_BY_NAME = `
  SELECT id, category_id, name, is_active
  FROM titles
  WHERE team_id = $1 AND category_id = $2 AND LOWER(name) = LOWER($3)
  LIMIT 1
`;

export const INSERT_TITLE = `
  INSERT INTO titles (id, team_id, category_id, name, position, is_active, scope)
  VALUES ($1, $2, $3, $4, $5, TRUE, $6)
  ON CONFLICT DO NOTHING
`;

export const SELECT_NEXT_TITLE_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM titles
  WHERE team_id = $1 AND category_id = $2
`;

export const UPDATE_CATEGORY = `
  UPDATE categories
  SET name = COALESCE($1, name), is_active = COALESCE($2, is_active)
  WHERE id = $3 AND team_id = $4
`;

export const UPDATE_TITLE = `
  UPDATE titles
  SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), scope = COALESCE($3, scope)
  WHERE id = $4 AND team_id = $5
`;

export const COUNT_CATEGORY_BY_LOWER_NAME = `
  SELECT COUNT(*)::int AS cnt
  FROM categories
  WHERE team_id = $1 AND LOWER(name) = LOWER($2)
`;

export const SELECT_CATEGORY_BY_ID = `
  SELECT id, name, is_active
  FROM categories
  WHERE id = $1 AND team_id = $2
  LIMIT 1
`;

export const DELETE_WORK_GROUPS_BY_CATEGORY = `
  DELETE FROM work_groups wg
  USING daily_reports dr
  WHERE wg.report_id = dr.id AND dr.team_id = $1 AND wg.category_id = $2
`;

export const DELETE_WORK_GROUPS_BY_TITLE = `
  DELETE FROM work_groups wg
  USING daily_reports dr
  WHERE wg.report_id = dr.id AND dr.team_id = $1 AND wg.title_id = $2
`;

export const DELETE_TITLES_BY_CATEGORY = `
  DELETE FROM titles
  WHERE team_id = $1 AND category_id = $2
`;

export const DELETE_CATEGORY = `
  DELETE FROM categories
  WHERE id = $1 AND team_id = $2
`;

export const DELETE_TITLE = `
  DELETE FROM titles
  WHERE id = $1 AND team_id = $2
`;
