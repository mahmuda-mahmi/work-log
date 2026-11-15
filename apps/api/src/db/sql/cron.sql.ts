export const DELETE_EXPIRED_SESSIONS = `
  DELETE FROM sessions
  WHERE expires_at < NOW(3)
`;

export const DELETE_STALE_INVITES = `
  DELETE FROM invites
  WHERE expires_at < DATE_SUB(NOW(3), INTERVAL 7 DAY)
`;

export const DELETE_STALE_PASSWORD_RESETS = `
  DELETE FROM password_resets
  WHERE expires_at < DATE_SUB(NOW(3), INTERVAL 7 DAY)
`;

export const DELETE_STALE_RATE_LIMITS = `
  DELETE FROM rate_limits
  WHERE window_start < DATE_SUB(NOW(3), INTERVAL 1 DAY)
`;
