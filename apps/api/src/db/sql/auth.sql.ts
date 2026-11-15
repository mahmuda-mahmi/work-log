export const COUNT_USERS = `
  SELECT COUNT(*) AS total
  FROM users
`;

export const SELECT_USER_FOR_LOGIN = `
  SELECT id, name, email, password_hash, is_active, session_version
  FROM users
  WHERE email = ?
  LIMIT 1
`;

export const INSERT_USER = `
  INSERT INTO users (id, name, email, password_hash, is_active, session_version)
  VALUES (?, ?, ?, ?, 1, 0)
`;

export const UPDATE_USER_LOGIN_TIMESTAMP = `
  UPDATE users
  SET last_login_at = UTC_TIMESTAMP(3)
  WHERE id = ?
`;

export const UPDATE_USER_PASSWORD_AND_REVOKE = `
  UPDATE users
  SET password_hash = ?, session_version = session_version + 1
  WHERE id = ?
`;

export const INSERT_SESSION = `
  INSERT INTO sessions (id, user_id, token_hash, session_version, last_active_at, expires_at)
  VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY))
`;

export const SELECT_ACTIVE_SESSION = `
  SELECT
    s.id AS session_id,
    s.last_active_at,
    s.expires_at,
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    t.id AS team_id,
    t.name AS team_name,
    t.slug AS team_slug,
    t.timezone AS team_timezone,
    t.document_title,
    t.file_prefix,
    t.prepared_by_default,
    t.logo_asset_id,
    tm.id AS member_id,
    tm.role,
    tm.display_name
  FROM sessions s
  INNER JOIN users u ON u.id = s.user_id
  INNER JOIN team_members tm ON tm.user_id = u.id AND tm.is_active = 1
  INNER JOIN teams t ON t.id = tm.team_id
  WHERE s.token_hash = ?
    AND s.expires_at > UTC_TIMESTAMP(3)
    AND s.session_version = u.session_version
    AND u.is_active = 1
  ORDER BY tm.sort_order ASC, tm.created_at ASC
  LIMIT 1
`;

export const TOUCH_SESSION = `
  UPDATE sessions
  SET last_active_at = UTC_TIMESTAMP(3)
  WHERE id = ?
`;

export const DELETE_SESSION_BY_ID = `
  DELETE FROM sessions
  WHERE id = ?
`;

export const DELETE_SESSIONS_BY_USER = `
  DELETE FROM sessions
  WHERE user_id = ?
`;

export const SELECT_RATE_LIMIT = `
  SELECT bucket_key, failures, window_start, locked_until
  FROM rate_limits
  WHERE bucket_key = ?
  LIMIT 1
`;

export const UPSERT_RATE_LIMIT_FAILURE = `
  INSERT INTO rate_limits (bucket_key, failures, window_start, locked_until)
  VALUES (?, 1, UTC_TIMESTAMP(3), NULL)
  ON DUPLICATE KEY UPDATE
    failures = IF(window_start < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE), 1, failures + 1),
    window_start = IF(window_start < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE), UTC_TIMESTAMP(3), window_start),
    locked_until = IF(
      IF(window_start < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE), 1, failures + 1) >= 5,
      DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE),
      NULL
    )
`;

export const DELETE_RATE_LIMIT = `
  DELETE FROM rate_limits
  WHERE bucket_key = ?
`;

export const SELECT_INVITE_BY_HASH = `
  SELECT id, team_id, email, role, expires_at, accepted_at
  FROM invites
  WHERE token_hash = ?
  LIMIT 1
`;

export const MARK_INVITE_ACCEPTED = `
  UPDATE invites
  SET accepted_at = UTC_TIMESTAMP(3), accepted_by_user_id = ?
  WHERE id = ? AND accepted_at IS NULL
`;

export const SELECT_PASSWORD_RESET_BY_HASH = `
  SELECT id, user_id, expires_at, used_at
  FROM password_resets
  WHERE token_hash = ?
  LIMIT 1
`;

export const MARK_PASSWORD_RESET_USED = `
  UPDATE password_resets
  SET used_at = UTC_TIMESTAMP(3)
  WHERE id = ? AND used_at IS NULL
`;
