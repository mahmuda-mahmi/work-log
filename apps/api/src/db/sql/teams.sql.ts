export const INSERT_TEAM = `
  INSERT INTO teams (id, name, slug, document_title, file_prefix, timezone, prepared_by_default, created_by_user_id)
  VALUES ($1, $2, $3, 'Work Log Daily Report', 'Team_Work_Status', $4, $5, $6)
`;

export const SELECT_TEAM_SETTINGS = `
  SELECT
    id,
    name,
    slug,
    document_title,
    file_prefix,
    timezone,
    prepared_by_default,
    members_can_add_dictionary,
    followups_enabled,
    logo_asset_id,
    document_font_family,
    document_font_size_pt
  FROM teams
  WHERE id = $1
  LIMIT 1
`;

export const SELECT_TEAM_BY_LOWER_SLUG_EXCLUDING_ID = `
  SELECT id
  FROM teams
  WHERE LOWER(slug) = LOWER($1)
    AND id <> $2
  LIMIT 1
`;

export const UPDATE_TEAM_SETTINGS = `
  UPDATE teams
  SET
    name = $1,
    slug = $2,
    document_title = $3,
    file_prefix = $4,
    timezone = $5,
    prepared_by_default = $6,
    members_can_add_dictionary = $7,
    followups_enabled = $8,
    document_font_family = $9,
    document_font_size_pt = $10
  WHERE id = $11
`;

export const INSERT_TEAM_MEMBER = `
  INSERT INTO team_members (id, team_id, user_id, role, display_name, sort_order, is_active)
  VALUES ($1, $2, $3, $4, $5, $6, TRUE)
`;

export const SELECT_TEAM_MEMBERS = `
  SELECT
    tm.id,
    tm.user_id,
    u.name,
    u.email,
    tm.display_name,
    tm.role,
    tm.sort_order,
    tm.is_active
  FROM team_members tm
  INNER JOIN users u ON u.id = tm.user_id
  WHERE tm.team_id = $1
  ORDER BY tm.is_active DESC, tm.sort_order ASC, tm.created_at ASC
`;

export const SELECT_TEAM_MEMBER_BY_ID = `
  SELECT id, team_id, user_id, role, display_name, is_active
  FROM team_members
  WHERE id = $1 AND team_id = $2
  LIMIT 1
`;

export const COUNT_ACTIVE_LEADS = `
  SELECT COUNT(*)::int AS total
  FROM team_members
  WHERE team_id = $1 AND role = 'lead' AND is_active = TRUE
`;

export const UPDATE_MEMBER_ROLE = `
  UPDATE team_members
  SET role = $1
  WHERE id = $2 AND team_id = $3
`;

export const UPDATE_MEMBER_DISPLAY_NAME = `
  UPDATE team_members
  SET display_name = $1
  WHERE id = $2 AND team_id = $3
`;

export const DEACTIVATE_TEAM_MEMBER = `
  UPDATE team_members
  SET is_active = FALSE
  WHERE id = $1 AND team_id = $2
`;

export const INSERT_INVITE = `
  INSERT INTO invites (id, team_id, email, role, token_hash, expires_at, created_by_user_id)
  VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '72 hours', $6)
`;

export const INSERT_PASSWORD_RESET = `
  INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_by_user_id)
  VALUES ($1, $2, $3, NOW() + INTERVAL '72 hours', $4)
`;

export const INSERT_TEAM_ASSET = `
  INSERT INTO team_assets (id, team_id, kind, file_name, mime_type, bytes, byte_size, sha256, width, height, created_by_user_id)
  VALUES ($1, $2, 'logo', $3, $4, $5, $6, $7, $8, $9, $10)
`;

export const SELECT_TEAM_ASSET_BY_HASH = `
  SELECT id
  FROM team_assets
  WHERE team_id = $1 AND sha256 = $2
  LIMIT 1
`;

export const UPDATE_TEAM_LOGO = `
  UPDATE teams
  SET logo_asset_id = $1
  WHERE id = $2
`;

export const SELECT_TEAM_LOGO = `
  SELECT ta.mime_type, ta.bytes, ta.sha256
  FROM teams t
  INNER JOIN team_assets ta ON ta.id = t.logo_asset_id
  WHERE t.id = $1
  LIMIT 1
`;
