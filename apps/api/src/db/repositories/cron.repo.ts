import type { Pool } from 'pg';
import {
  DELETE_EXPIRED_SESSIONS,
  DELETE_STALE_INVITES,
  DELETE_STALE_PASSWORD_RESETS,
  DELETE_STALE_RATE_LIMITS,
} from '../sql/cron.sql.js';

export interface CleanupCounts {
  sessions: number;
  invites: number;
  passwordResets: number;
  rateLimits: number;
}

export async function runDatabaseCleanup(pool: Pool): Promise<CleanupCounts> {
  const [sessionsRes, invitesRes, resetsRes, rateLimitsRes] = await Promise.all([
    pool.query(DELETE_EXPIRED_SESSIONS),
    pool.query(DELETE_STALE_INVITES),
    pool.query(DELETE_STALE_PASSWORD_RESETS),
    pool.query(DELETE_STALE_RATE_LIMITS),
  ]);

  return {
    sessions: sessionsRes.rowCount ?? 0,
    invites: invitesRes.rowCount ?? 0,
    passwordResets: resetsRes.rowCount ?? 0,
    rateLimits: rateLimitsRes.rowCount ?? 0,
  };
}
