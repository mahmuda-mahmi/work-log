import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { MemberRole } from '@cghq/contracts';
import {
  COUNT_USERS,
  DELETE_RATE_LIMIT,
  DELETE_SESSIONS_BY_USER,
  DELETE_SESSION_BY_ID,
  INSERT_SESSION,
  INSERT_USER,
  MARK_INVITE_ACCEPTED,
  MARK_PASSWORD_RESET_USED,
  SELECT_ACTIVE_SESSION,
  SELECT_INVITE_BY_HASH,
  SELECT_PASSWORD_RESET_BY_HASH,
  SELECT_RATE_LIMIT,
  SELECT_USER_FOR_LOGIN,
  TOUCH_SESSION,
  UPDATE_USER_LOGIN_TIMESTAMP,
  UPDATE_USER_PASSWORD_AND_REVOKE,
  UPSERT_RATE_LIMIT_FAILURE,
} from '../sql/auth.sql.js';

type Conn = Pool | PoolConnection;

type CountRow = RowDataPacket & { total: number };
type UserLoginRow = RowDataPacket & {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  is_active: number;
  session_version: number;
};
type ActiveSessionRow = RowDataPacket & {
  session_id: string;
  last_active_at: Date | string;
  expires_at: Date | string;
  user_id: string;
  user_name: string;
  user_email: string;
  team_id: string;
  team_name: string;
  team_slug: string;
  team_timezone: string;
  document_title: string;
  file_prefix: string;
  prepared_by_default: string | null;
  logo_asset_id: string | null;
  member_id: string;
  role: MemberRole;
  display_name: string;
};
type RateLimitRow = RowDataPacket & {
  bucket_key: string;
  failures: number;
  window_start: Date | string;
  locked_until: Date | string | null;
};
type InviteRow = RowDataPacket & {
  id: string;
  team_id: string;
  email: string | null;
  role: MemberRole;
  expires_at: Date | string;
  accepted_at: Date | string | null;
};
type PasswordResetRow = RowDataPacket & {
  id: string;
  user_id: string;
  expires_at: Date | string;
  used_at: Date | string | null;
};

export async function countUsers(conn: Conn): Promise<number> {
  const [rows] = await conn.execute<CountRow[]>(COUNT_USERS, []);
  return Number(rows[0]?.total ?? 0);
}

export async function findUserForLogin(conn: Conn, email: string) {
  const [rows] = await conn.execute<UserLoginRow[]>(SELECT_USER_FOR_LOGIN, [email]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    isActive: r.is_active === 1,
    sessionVersion: r.session_version,
  };
}

export async function insertUser(
  conn: Conn,
  params: { id: string; name: string; email: string; passwordHash: string },
): Promise<void> {
  await conn.execute(INSERT_USER, [params.id, params.name, params.email, params.passwordHash]);
}

export async function updateUserLoginTimestamp(conn: Conn, userId: string): Promise<void> {
  await conn.execute(UPDATE_USER_LOGIN_TIMESTAMP, [userId]);
}

export async function updateUserPasswordAndRevoke(
  conn: Conn,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await conn.execute(UPDATE_USER_PASSWORD_AND_REVOKE, [passwordHash, userId]);
  await conn.execute(DELETE_SESSIONS_BY_USER, [userId]);
}

export async function insertSession(
  conn: Conn,
  params: {
    id: string;
    userId: string;
    tokenHash: string;
    sessionVersion: number;
    ttlDays: number;
  },
): Promise<void> {
  await conn.execute(INSERT_SESSION, [
    params.id,
    params.userId,
    params.tokenHash,
    params.sessionVersion,
    params.ttlDays,
  ]);
}

export async function findActiveSessionByTokenHash(conn: Conn, tokenHash: string) {
  const [rows] = await conn.execute<ActiveSessionRow[]>(SELECT_ACTIVE_SESSION, [tokenHash]);
  const r = rows[0];
  if (!r) return null;
  return {
    sessionId: r.session_id,
    lastActiveAt: r.last_active_at,
    expiresAt: r.expires_at,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    teamId: r.team_id,
    teamName: r.team_name,
    teamSlug: r.team_slug,
    teamTimezone: r.team_timezone,
    documentTitle: r.document_title,
    filePrefix: r.file_prefix,
    preparedByDefault: r.prepared_by_default,
    hasLogo: r.logo_asset_id !== null,
    memberId: r.member_id,
    role: r.role,
    displayName: r.display_name,
  };
}

export async function touchSessionActivity(conn: Conn, sessionId: string): Promise<void> {
  await conn.execute(TOUCH_SESSION, [sessionId]);
}

export async function deleteSessionById(conn: Conn, sessionId: string): Promise<void> {
  await conn.execute(DELETE_SESSION_BY_ID, [sessionId]);
}

export async function deleteSessionsByUserId(conn: Conn, userId: string): Promise<void> {
  await conn.execute(DELETE_SESSIONS_BY_USER, [userId]);
}

export async function getRateLimitLock(conn: Conn, bucketKey: string): Promise<Date | null> {
  const [rows] = await conn.execute<RateLimitRow[]>(SELECT_RATE_LIMIT, [bucketKey]);
  const r = rows[0];
  if (!r?.locked_until) return null;
  const lockedUntil = new Date(r.locked_until);
  return lockedUntil.getTime() > Date.now() ? lockedUntil : null;
}

export async function recordRateLimitFailure(conn: Conn, bucketKey: string): Promise<void> {
  await conn.execute(UPSERT_RATE_LIMIT_FAILURE, [bucketKey]);
}

export async function clearRateLimit(conn: Conn, bucketKey: string): Promise<void> {
  await conn.execute(DELETE_RATE_LIMIT, [bucketKey]);
}

export async function findInviteByHash(conn: Conn, tokenHash: string) {
  const [rows] = await conn.execute<InviteRow[]>(SELECT_INVITE_BY_HASH, [tokenHash]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    teamId: r.team_id,
    email: r.email,
    role: r.role,
    expiresAt: new Date(r.expires_at),
    acceptedAt: r.accepted_at ? new Date(r.accepted_at) : null,
  };
}

export async function markInviteAccepted(
  conn: Conn,
  inviteId: string,
  userId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(MARK_INVITE_ACCEPTED, [userId, inviteId]);
  return res.affectedRows === 1;
}

export async function findPasswordResetByHash(conn: Conn, tokenHash: string) {
  const [rows] = await conn.execute<PasswordResetRow[]>(SELECT_PASSWORD_RESET_BY_HASH, [tokenHash]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    expiresAt: new Date(r.expires_at),
    usedAt: r.used_at ? new Date(r.used_at) : null,
  };
}

export async function markPasswordResetUsed(conn: Conn, resetId: string): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(MARK_PASSWORD_RESET_USED, [resetId]);
  return res.affectedRows === 1;
}
