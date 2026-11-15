export const INSERT_TEAM = `
  INSERT INTO teams (id, name, slug, document_title, file_prefix, timezone, prepared_by_default, created_by_user_id)
  VALUES (?, ?, ?, 'CGHQ Daily Report', 'CGHQ_Team_Work_Status', ?, ?, ?)
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
    logo_asset_id
  FROM teams
  WHERE id = ?
  LIMIT 1
`;

export const UPDATE_TEAM_SETTINGS = `
  UPDATE teams
  SET
    name = ?,
    document_title = ?,
    file_prefix = ?,
    timezone = ?,
    prepared_by_default = ?,
    members_can_add_dictionary = ?,
    followups_enabled = ?
  WHERE id = ?
`;

export const INSERT_TEAM_MEMBER = `
  INSERT INTO team_members (id, team_id, user_id, role, display_name, sort_order, is_active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
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
  WHERE tm.team_id = ?
  ORDER BY tm.is_active DESC, tm.sort_order ASC, tm.created_at ASC
`;

export const SELECT_TEAM_MEMBER_BY_ID = `
  SELECT id, team_id, user_id, role, display_name, is_active
  FROM team_members
  WHERE id = ? AND team_id = ?
  LIMIT 1
`;

export const COUNT_ACTIVE_LEADS = `
  SELECT COUNT(*) AS total
  FROM team_members
  WHERE team_id = ? AND role = 'lead' AND is_active = 1
`;

export const UPDATE_MEMBER_ROLE = `
  UPDATE team_members
  SET role = ?
  WHERE id = ? AND team_id = ?
`;

export const DEACTIVATE_TEAM_MEMBER = `
  UPDATE team_members
  SET is_active = 0
  WHERE id = ? AND team_id = ?
`;

export const INSERT_INVITE = `
  INSERT INTO invites (id, team_id, email, role, token_hash, expires_at, created_by_user_id)
  VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 72 HOUR), ?)
`;

export const INSERT_PASSWORD_RESET = `
  INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_by_user_id)
  VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 72 HOUR), ?)
`;

export const INSERT_TEAM_ASSET = `
  INSERT INTO team_assets (id, team_id, kind, file_name, mime_type, bytes, byte_size, sha256, width, height, created_by_user_id)
  VALUES (?, ?, 'logo', ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_TEAM_ASSET_BY_HASH = `
  SELECT id
  FROM team_assets
  WHERE team_id = ? AND sha256 = ?
  LIMIT 1
`;

export const UPDATE_TEAM_LOGO = `
  UPDATE teams
  SET logo_asset_id = ?
  WHERE id = ?
`;

export const SELECT_TEAM_LOGO = `
  SELECT ta.mime_type, ta.bytes, ta.sha256
  FROM teams t
  INNER JOIN team_assets ta ON ta.id = t.logo_asset_id
  WHERE t.id = ?
  LIMIT 1
`;
