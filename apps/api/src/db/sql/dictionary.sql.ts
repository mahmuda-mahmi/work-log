export const SELECT_CATEGORIES_BY_TEAM = `
  SELECT id, name, position, is_active
  FROM categories
  WHERE team_id = ?
  ORDER BY is_active DESC, position ASC, name ASC
`;

export const SELECT_TITLES_BY_TEAM = `
  SELECT id, category_id, name, position, is_active
  FROM titles
  WHERE team_id = ?
  ORDER BY is_active DESC, position ASC, name ASC
`;

export const SELECT_CATEGORY_BY_NAME = `
  SELECT id, name, is_active
  FROM categories
  WHERE team_id = ? AND name = ?
  LIMIT 1
`;

export const INSERT_CATEGORY = `
  INSERT INTO categories (id, team_id, name, position, is_active)
  VALUES (?, ?, ?, ?, 1)
`;

export const SELECT_NEXT_CATEGORY_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM categories
  WHERE team_id = ?
`;

export const SELECT_TITLE_BY_NAME = `
  SELECT id, category_id, name, is_active
  FROM titles
  WHERE team_id = ? AND category_id = ? AND name = ?
  LIMIT 1
`;

export const INSERT_TITLE = `
  INSERT INTO titles (id, team_id, category_id, name, position, is_active)
  VALUES (?, ?, ?, ?, ?, 1)
`;

export const SELECT_NEXT_TITLE_POSITION = `
  SELECT COALESCE(MAX(position), 0) + 10 AS next_pos
  FROM titles
  WHERE team_id = ? AND category_id = ?
`;

export const UPDATE_CATEGORY = `
  UPDATE categories
  SET name = COALESCE(?, name), is_active = COALESCE(?, is_active)
  WHERE id = ? AND team_id = ?
`;

export const UPDATE_TITLE = `
  UPDATE titles
  SET name = COALESCE(?, name), is_active = COALESCE(?, is_active)
  WHERE id = ? AND team_id = ?
`;

export const COUNT_CATEGORY_BY_LOWER_NAME = `
  SELECT COUNT(*) AS cnt
  FROM categories
  WHERE team_id = ? AND LOWER(name) = LOWER(?)
`;

export const SELECT_CATEGORY_BY_ID = `
  SELECT id, name, is_active
  FROM categories
  WHERE id = ? AND team_id = ?
  LIMIT 1
`;
