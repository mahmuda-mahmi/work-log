import type { MemberRole } from '@cghq/contracts';
import type { DbClient } from '../pool.js';
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
  SELECT_USER_TEAMS,
  TOUCH_SESSION,
  UPDATE_SESSION_ACTIVE_TEAM,
  UPDATE_USER_AVATAR,
  UPDATE_USER_LOGIN_TIMESTAMP,
  UPDATE_USER_PASSWORD_AND_REVOKE,
  UPSERT_RATE_LIMIT_FAILURE,
} from '../sql/auth.sql.js';

type CountRow = { total: number };
type UserLoginRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  session_version: number;
  has_password: boolean;
};
type ActiveSessionRow = {
  session_id: string;
  last_active_at: Date | string;
  expires_at: Date | string;
  user_id: string;
  user_name: string;
  user_email: string;
  avatar_url: string | null;
  has_password: boolean;
  team_id: string | null;
  team_name: string | null;
  team_slug: string | null;
  team_timezone: string | null;
  document_title: string | null;
  file_prefix: string | null;
  prepared_by_default: string | null;
  logo_asset_id: string | null;
  member_id: string | null;
  role: MemberRole | null;
  display_name: string | null;
  pending_join_team_name: string | null;
};
type RateLimitRow = {
  bucket_key: string;
  failures: number;
  window_start: Date | string;
  locked_until: Date | string | null;
};
type InviteRow = {
  id: string;
  team_id: string;
  email: string | null;
  role: MemberRole;
  expires_at: Date | string;
  accepted_at: Date | string | null;
};
type PasswordResetRow = {
  id: string;
  user_id: string;
  expires_at: Date | string;
  used_at: Date | string | null;
};

export async function countUsers(conn: DbClient): Promise<number> {
  const res = await conn.query<CountRow>(COUNT_USERS);
  return Number(res.rows[0]?.total ?? 0);
}

export async function findUserForLogin(conn: DbClient, email: string) {
  const res = await conn.query<UserLoginRow>(SELECT_USER_FOR_LOGIN, [email]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    isActive: Boolean(r.is_active),
    sessionVersion: r.session_version,
    hasPassword: Boolean(r.has_password),
  };
}

export async function insertUser(
  conn: DbClient,
  params: { id: string; name: string; email: string; passwordHash: string; hasPassword?: boolean },
): Promise<void> {
  await conn.query(INSERT_USER, [
    params.id,
    params.name,
    params.email,
    params.passwordHash,
    params.hasPassword ?? true,
  ]);
}

export async function updateUserLoginTimestamp(conn: DbClient, userId: string): Promise<void> {
  await conn.query(UPDATE_USER_LOGIN_TIMESTAMP, [userId]);
}

export async function updateUserPasswordAndRevoke(
  conn: DbClient,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await conn.query(UPDATE_USER_PASSWORD_AND_REVOKE, [passwordHash, userId]);
  await conn.query(DELETE_SESSIONS_BY_USER, [userId]);
}

export async function insertSession(
  conn: DbClient,
  params: {
    id: string;
    userId: string;
    tokenHash: string;
    sessionVersion: number;
    ttlDays: number;
  },
): Promise<void> {
  await conn.query(INSERT_SESSION, [
    params.id,
    params.userId,
    params.tokenHash,
    params.sessionVersion,
    params.ttlDays,
  ]);
}

export async function findActiveSessionByTokenHash(conn: DbClient, tokenHash: string) {
  const res = await conn.query<ActiveSessionRow>(SELECT_ACTIVE_SESSION, [tokenHash]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    sessionId: r.session_id,
    lastActiveAt: r.last_active_at,
    expiresAt: r.expires_at,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    avatarUrl: r.avatar_url,
    hasPassword: Boolean(r.has_password),
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
    pendingJoinTeamName: r.pending_join_team_name,
  };
}

export async function touchSessionActivity(conn: DbClient, sessionId: string): Promise<void> {
  await conn.query(TOUCH_SESSION, [sessionId]);
}

export async function updateUserAvatar(
  conn: DbClient,
  userId: string,
  avatarUrl: string | null,
): Promise<void> {
  await conn.query(UPDATE_USER_AVATAR, [avatarUrl, userId]);
}

export async function listUserTeams(conn: DbClient, userId: string) {
  const res = await conn.query<{
    team_id: string;
    team_name: string;
    team_slug: string;
    role: MemberRole;
    display_name: string;
  }>(SELECT_USER_TEAMS, [userId]);
  return res.rows.map((r) => ({
    teamId: r.team_id,
    teamName: r.team_name,
    teamSlug: r.team_slug,
    role: r.role,
    displayName: r.display_name,
  }));
}

export async function setSessionActiveTeam(
  conn: DbClient,
  sessionId: string,
  teamId: string,
): Promise<void> {
  await conn.query(UPDATE_SESSION_ACTIVE_TEAM, [teamId, sessionId]);
}

export async function deleteSessionById(conn: DbClient, sessionId: string): Promise<void> {
  await conn.query(DELETE_SESSION_BY_ID, [sessionId]);
}

export async function deleteSessionsByUserId(conn: DbClient, userId: string): Promise<void> {
  await conn.query(DELETE_SESSIONS_BY_USER, [userId]);
}

export async function getRateLimitLock(conn: DbClient, bucketKey: string): Promise<Date | null> {
  const res = await conn.query<RateLimitRow>(SELECT_RATE_LIMIT, [bucketKey]);
  const r = res.rows[0];
  if (!r?.locked_until) return null;
  const lockedUntil = new Date(r.locked_until);
  return lockedUntil.getTime() > Date.now() ? lockedUntil : null;
}

export async function recordRateLimitFailure(conn: DbClient, bucketKey: string): Promise<void> {
  await conn.query(UPSERT_RATE_LIMIT_FAILURE, [bucketKey]);
}

export async function clearRateLimit(conn: DbClient, bucketKey: string): Promise<void> {
  await conn.query(DELETE_RATE_LIMIT, [bucketKey]);
}

export async function findInviteByHash(conn: DbClient, tokenHash: string) {
  const res = await conn.query<InviteRow>(SELECT_INVITE_BY_HASH, [tokenHash]);
  const r = res.rows[0];
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
  conn: DbClient,
  inviteId: string,
  userId: string,
): Promise<boolean> {
  const res = await conn.query(MARK_INVITE_ACCEPTED, [userId, inviteId]);
  return (res.rowCount ?? 0) === 1;
}

export async function findPasswordResetByHash(conn: DbClient, tokenHash: string) {
  const res = await conn.query<PasswordResetRow>(SELECT_PASSWORD_RESET_BY_HASH, [tokenHash]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    expiresAt: new Date(r.expires_at),
    usedAt: r.used_at ? new Date(r.used_at) : null,
  };
}

export async function markPasswordResetUsed(conn: DbClient, resetId: string): Promise<boolean> {
  const res = await conn.query(MARK_PASSWORD_RESET_USED, [resetId]);
  return (res.rowCount ?? 0) === 1;
}
