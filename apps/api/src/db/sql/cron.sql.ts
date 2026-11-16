export const DELETE_EXPIRED_SESSIONS = `
  DELETE FROM sessions
  WHERE expires_at < NOW()
`;

export const DELETE_STALE_INVITES = `
  DELETE FROM invites
  WHERE expires_at < NOW() - INTERVAL '7 days'
`;

export const DELETE_STALE_PASSWORD_RESETS = `
  DELETE FROM password_resets
  WHERE expires_at < NOW() - INTERVAL '7 days'
`;

export const DELETE_STALE_RATE_LIMITS = `
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 day'
`;
