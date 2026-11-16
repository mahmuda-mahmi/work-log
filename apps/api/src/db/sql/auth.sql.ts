export const COUNT_USERS = `
  SELECT COUNT(*)::int AS total
  FROM users
`;

export const SELECT_USER_FOR_LOGIN = `
  SELECT id, name, email, password_hash, is_active, session_version
  FROM users
  WHERE LOWER(email) = LOWER($1)
  LIMIT 1
`;

export const INSERT_USER = `
  INSERT INTO users (id, name, email, password_hash, is_active, session_version)
  VALUES ($1, $2, $3, $4, TRUE, 0)
`;

export const UPDATE_USER_LOGIN_TIMESTAMP = `
  UPDATE users
  SET last_login_at = NOW()
  WHERE id = $1
`;

export const UPDATE_USER_PASSWORD_AND_REVOKE = `
  UPDATE users
  SET password_hash = $1, session_version = session_version + 1
  WHERE id = $2
`;

export const INSERT_SESSION = `
  INSERT INTO sessions (id, user_id, token_hash, session_version, last_active_at, expires_at)
  VALUES ($1, $2, $3, $4, NOW(), NOW() + ($5 * INTERVAL '1 day'))
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
    tm.display_name,
    (
      SELECT t2.name
      FROM team_join_requests jr
      INNER JOIN teams t2 ON t2.id = jr.team_id
      WHERE jr.user_id = u.id AND jr.status = 'pending'
      ORDER BY jr.created_at DESC
      LIMIT 1
    ) AS pending_join_team_name
  FROM sessions s
  INNER JOIN users u ON u.id = s.user_id
  LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.is_active = TRUE
  LEFT JOIN teams t ON t.id = tm.team_id
  WHERE s.token_hash = $1
    AND s.expires_at > NOW()
    AND s.session_version = u.session_version
    AND u.is_active = TRUE
  ORDER BY tm.sort_order ASC NULLS LAST, tm.created_at ASC NULLS LAST
  LIMIT 1
`;

export const TOUCH_SESSION = `
  UPDATE sessions
  SET last_active_at = NOW()
  WHERE id = $1
`;

export const DELETE_SESSION_BY_ID = `
  DELETE FROM sessions
  WHERE id = $1
`;

export const DELETE_SESSIONS_BY_USER = `
  DELETE FROM sessions
  WHERE user_id = $1
`;

export const SELECT_RATE_LIMIT = `
  SELECT bucket_key, failures, window_start, locked_until
  FROM rate_limits
  WHERE bucket_key = $1
  LIMIT 1
`;

export const UPSERT_RATE_LIMIT_FAILURE = `
  INSERT INTO rate_limits (bucket_key, failures, window_start, locked_until)
  VALUES ($1, 1, NOW(), NULL)
  ON CONFLICT (bucket_key) DO UPDATE SET
    failures = CASE
      WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes' THEN 1
      ELSE rate_limits.failures + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes' THEN NOW()
      ELSE rate_limits.window_start
    END,
    locked_until = CASE
      WHEN (
        CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes' THEN 1
          ELSE rate_limits.failures + 1
        END
      ) >= 5 THEN NOW() + INTERVAL '15 minutes'
      ELSE NULL
    END
`;

export const DELETE_RATE_LIMIT = `
  DELETE FROM rate_limits
  WHERE bucket_key = $1
`;

export const SELECT_INVITE_BY_HASH = `
  SELECT id, team_id, email, role, expires_at, accepted_at
  FROM invites
  WHERE token_hash = $1
  LIMIT 1
`;

export const MARK_INVITE_ACCEPTED = `
  UPDATE invites
  SET accepted_at = NOW(), accepted_by_user_id = $1
  WHERE id = $2 AND accepted_at IS NULL
`;

export const SELECT_PASSWORD_RESET_BY_HASH = `
  SELECT id, user_id, expires_at, used_at
  FROM password_resets
  WHERE token_hash = $1
  LIMIT 1
`;

export const MARK_PASSWORD_RESET_USED = `
  UPDATE password_resets
  SET used_at = NOW()
  WHERE id = $1 AND used_at IS NULL
`;
