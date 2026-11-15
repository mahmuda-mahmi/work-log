import type { Pool, ResultSetHeader } from 'mysql2/promise';
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
  const [sessionsRes] = await pool.execute<ResultSetHeader>(DELETE_EXPIRED_SESSIONS);
  const [invitesRes] = await pool.execute<ResultSetHeader>(DELETE_STALE_INVITES);
  const [resetsRes] = await pool.execute<ResultSetHeader>(DELETE_STALE_PASSWORD_RESETS);
  const [rateLimitsRes] = await pool.execute<ResultSetHeader>(DELETE_STALE_RATE_LIMITS);

  return {
    sessions: sessionsRes.affectedRows,
    invites: invitesRes.affectedRows,
    passwordResets: resetsRes.affectedRows,
    rateLimits: rateLimitsRes.affectedRows,
  };
}
