import type { MemberRole, MemberSummary, TeamSettings } from '@cghq/contracts';
import type { DbClient } from '../pool.js';
import {
  COUNT_ACTIVE_LEADS,
  DEACTIVATE_TEAM_MEMBER,
  INSERT_INVITE,
  INSERT_PASSWORD_RESET,
  INSERT_TEAM,
  INSERT_TEAM_ASSET,
  INSERT_TEAM_MEMBER,
  SELECT_TEAM_ASSET_BY_HASH,
  SELECT_TEAM_LOGO,
  SELECT_TEAM_MEMBERS,
  SELECT_TEAM_MEMBER_BY_ID,
  SELECT_TEAM_SETTINGS,
  UPDATE_MEMBER_DISPLAY_NAME,
  UPDATE_MEMBER_ROLE,
  UPDATE_TEAM_LOGO,
  UPDATE_TEAM_SETTINGS,
} from '../sql/teams.sql.js';

type TeamSettingsRow = {
  id: string;
  name: string;
  slug: string;
  document_title: string;
  file_prefix: string;
  timezone: string;
  prepared_by_default: string | null;
  members_can_add_dictionary: boolean;
  followups_enabled: boolean;
  logo_asset_id: string | null;
};

type MemberRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  display_name: string;
  role: MemberRole;
  sort_order: number;
  is_active: boolean;
};

type SingleMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: MemberRole;
  display_name: string;
  is_active: boolean;
};

type CountRow = { total: number };
type AssetIdRow = { id: string };
type LogoRow = { mime_type: string; bytes: Buffer; sha256: string };

export async function insertTeam(
  conn: DbClient,
  params: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    preparedByDefault: string;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.query(INSERT_TEAM, [
    params.id,
    params.name,
    params.slug,
    params.timezone,
    params.preparedByDefault,
    params.createdByUserId,
  ]);
}

export async function insertTeamMember(
  conn: DbClient,
  params: {
    id: string;
    teamId: string;
    userId: string;
    role: MemberRole;
    displayName: string;
    sortOrder?: number;
  },
): Promise<void> {
  await conn.query(INSERT_TEAM_MEMBER, [
    params.id,
    params.teamId,
    params.userId,
    params.role,
    params.displayName,
    params.sortOrder ?? 1000,
  ]);
}

export async function findTeamSettings(conn: DbClient, teamId: string): Promise<TeamSettings | null> {
  const res = await conn.query<TeamSettingsRow>(SELECT_TEAM_SETTINGS, [teamId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    documentTitle: r.document_title,
    filePrefix: r.file_prefix,
    timezone: r.timezone,
    preparedByDefault: r.prepared_by_default,
    membersCanAddDictionary: Boolean(r.members_can_add_dictionary),
    followupsEnabled: Boolean(r.followups_enabled),
    hasLogo: r.logo_asset_id !== null,
  };
}

export async function updateTeamSettings(
  conn: DbClient,
  teamId: string,
  settings: Omit<TeamSettings, 'id' | 'slug' | 'hasLogo'>,
): Promise<void> {
  await conn.query(UPDATE_TEAM_SETTINGS, [
    settings.name,
    settings.documentTitle,
    settings.filePrefix,
    settings.timezone,
    settings.preparedByDefault,
    settings.membersCanAddDictionary,
    settings.followupsEnabled,
    teamId,
  ]);
}

export async function listTeamMembers(conn: DbClient, teamId: string): Promise<MemberSummary[]> {
  const res = await conn.query<MemberRow>(SELECT_TEAM_MEMBERS, [teamId]);
  return res.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    sortOrder: r.sort_order,
    isActive: Boolean(r.is_active),
  }));
}

export async function findTeamMemberById(conn: DbClient, teamId: string, memberId: string) {
  const res = await conn.query<SingleMemberRow>(SELECT_TEAM_MEMBER_BY_ID, [memberId, teamId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    teamId: r.team_id,
    userId: r.user_id,
    role: r.role,
    displayName: r.display_name,
    isActive: Boolean(r.is_active),
  };
}

export async function countActiveLeads(conn: DbClient, teamId: string): Promise<number> {
  const res = await conn.query<CountRow>(COUNT_ACTIVE_LEADS, [teamId]);
  return Number(res.rows[0]?.total ?? 0);
}

export async function updateMemberDisplayName(
  conn: DbClient,
  teamId: string,
  memberId: string,
  displayName: string,
): Promise<void> {
  await conn.query(UPDATE_MEMBER_DISPLAY_NAME, [displayName, memberId, teamId]);
}

export async function updateMemberRole(
  conn: DbClient,
  teamId: string,
  memberId: string,
  role: MemberRole,
): Promise<boolean> {
  const res = await conn.query(UPDATE_MEMBER_ROLE, [role, memberId, teamId]);
  return (res.rowCount ?? 0) === 1;
}

export async function deactivateTeamMember(
  conn: DbClient,
  teamId: string,
  memberId: string,
): Promise<boolean> {
  const res = await conn.query(DEACTIVATE_TEAM_MEMBER, [memberId, teamId]);
  return (res.rowCount ?? 0) === 1;
}

export async function insertInvite(
  conn: DbClient,
  params: {
    id: string;
    teamId: string;
    email: string | null;
    role: MemberRole;
    tokenHash: string;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.query(INSERT_INVITE, [
    params.id,
    params.teamId,
    params.email,
    params.role,
    params.tokenHash,
    params.createdByUserId,
  ]);
}

export async function insertPasswordReset(
  conn: DbClient,
  params: {
    id: string;
    userId: string;
    tokenHash: string;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.query(INSERT_PASSWORD_RESET, [
    params.id,
    params.userId,
    params.tokenHash,
    params.createdByUserId,
  ]);
}

export async function upsertTeamLogo(
  conn: DbClient,
  params: {
    assetId: string;
    teamId: string;
    fileName: string;
    mimeType: 'image/png' | 'image/jpeg';
    bytes: Buffer;
    sha256: string;
    width: number | null;
    height: number | null;
    createdByUserId: string;
  },
): Promise<string> {
  const existing = await conn.query<AssetIdRow>(SELECT_TEAM_ASSET_BY_HASH, [
    params.teamId,
    params.sha256,
  ]);
  const assetId = existing.rows[0]?.id ?? params.assetId;
  if (!existing.rows[0]) {
    await conn.query(INSERT_TEAM_ASSET, [
      assetId,
      params.teamId,
      params.fileName,
      params.mimeType,
      params.bytes,
      params.bytes.length,
      params.sha256,
      params.width,
      params.height,
      params.createdByUserId,
    ]);
  }
  await conn.query(UPDATE_TEAM_LOGO, [assetId, params.teamId]);
  return assetId;
}

export async function findTeamLogo(conn: DbClient, teamId: string) {
  const res = await conn.query<LogoRow>(SELECT_TEAM_LOGO, [teamId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    mimeType: r.mime_type,
    bytes: Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes),
    sha256: r.sha256,
  };
}
