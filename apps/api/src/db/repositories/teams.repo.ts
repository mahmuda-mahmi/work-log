import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { MemberRole, MemberSummary, TeamSettings } from '@cghq/contracts';
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
  UPDATE_MEMBER_ROLE,
  UPDATE_TEAM_LOGO,
  UPDATE_TEAM_SETTINGS,
} from '../sql/teams.sql.js';

type Conn = Pool | PoolConnection;

type TeamSettingsRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  document_title: string;
  file_prefix: string;
  timezone: string;
  prepared_by_default: string | null;
  members_can_add_dictionary: number;
  followups_enabled: number;
  logo_asset_id: string | null;
};

type MemberRow = RowDataPacket & {
  id: string;
  user_id: string;
  name: string;
  email: string;
  display_name: string;
  role: MemberRole;
  sort_order: number;
  is_active: number;
};

type SingleMemberRow = RowDataPacket & {
  id: string;
  team_id: string;
  user_id: string;
  role: MemberRole;
  display_name: string;
  is_active: number;
};

type CountRow = RowDataPacket & { total: number };
type AssetIdRow = RowDataPacket & { id: string };
type LogoRow = RowDataPacket & { mime_type: string; bytes: Buffer; sha256: string };

export async function insertTeam(
  conn: Conn,
  params: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    preparedByDefault: string;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.execute(INSERT_TEAM, [
    params.id,
    params.name,
    params.slug,
    params.timezone,
    params.preparedByDefault,
    params.createdByUserId,
  ]);
}

export async function insertTeamMember(
  conn: Conn,
  params: {
    id: string;
    teamId: string;
    userId: string;
    role: MemberRole;
    displayName: string;
    sortOrder?: number;
  },
): Promise<void> {
  await conn.execute(INSERT_TEAM_MEMBER, [
    params.id,
    params.teamId,
    params.userId,
    params.role,
    params.displayName,
    params.sortOrder ?? 1000,
  ]);
}

export async function findTeamSettings(conn: Conn, teamId: string): Promise<TeamSettings | null> {
  const [rows] = await conn.execute<TeamSettingsRow[]>(SELECT_TEAM_SETTINGS, [teamId]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    documentTitle: r.document_title,
    filePrefix: r.file_prefix,
    timezone: r.timezone,
    preparedByDefault: r.prepared_by_default,
    membersCanAddDictionary: r.members_can_add_dictionary === 1,
    followupsEnabled: r.followups_enabled === 1,
    hasLogo: r.logo_asset_id !== null,
  };
}

export async function updateTeamSettings(
  conn: Conn,
  teamId: string,
  settings: Omit<TeamSettings, 'id' | 'slug' | 'hasLogo'>,
): Promise<void> {
  await conn.execute(UPDATE_TEAM_SETTINGS, [
    settings.name,
    settings.documentTitle,
    settings.filePrefix,
    settings.timezone,
    settings.preparedByDefault,
    settings.membersCanAddDictionary ? 1 : 0,
    settings.followupsEnabled ? 1 : 0,
    teamId,
  ]);
}

export async function listTeamMembers(conn: Conn, teamId: string): Promise<MemberSummary[]> {
  const [rows] = await conn.execute<MemberRow[]>(SELECT_TEAM_MEMBERS, [teamId]);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    sortOrder: r.sort_order,
    isActive: r.is_active === 1,
  }));
}

export async function findTeamMemberById(conn: Conn, teamId: string, memberId: string) {
  const [rows] = await conn.execute<SingleMemberRow[]>(SELECT_TEAM_MEMBER_BY_ID, [memberId, teamId]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    teamId: r.team_id,
    userId: r.user_id,
    role: r.role,
    displayName: r.display_name,
    isActive: r.is_active === 1,
  };
}

export async function countActiveLeads(conn: Conn, teamId: string): Promise<number> {
  const [rows] = await conn.execute<CountRow[]>(COUNT_ACTIVE_LEADS, [teamId]);
  return Number(rows[0]?.total ?? 0);
}

export async function updateMemberRole(
  conn: Conn,
  teamId: string,
  memberId: string,
  role: MemberRole,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_MEMBER_ROLE, [role, memberId, teamId]);
  return res.affectedRows === 1;
}

export async function deactivateTeamMember(
  conn: Conn,
  teamId: string,
  memberId: string,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(DEACTIVATE_TEAM_MEMBER, [memberId, teamId]);
  return res.affectedRows === 1;
}

export async function insertInvite(
  conn: Conn,
  params: {
    id: string;
    teamId: string;
    email: string | null;
    role: MemberRole;
    tokenHash: string;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.execute(INSERT_INVITE, [
    params.id,
    params.teamId,
    params.email,
    params.role,
    params.tokenHash,
    params.createdByUserId,
  ]);
}

export async function insertPasswordReset(
  conn: Conn,
  params: {
    id: string;
    userId: string;
    tokenHash: string;
    createdByUserId: string;
  },
): Promise<void> {
  await conn.execute(INSERT_PASSWORD_RESET, [
    params.id,
    params.userId,
    params.tokenHash,
    params.createdByUserId,
  ]);
}

export async function upsertTeamLogo(
  conn: Conn,
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
  const [existing] = await conn.execute<AssetIdRow[]>(SELECT_TEAM_ASSET_BY_HASH, [
    params.teamId,
    params.sha256,
  ]);
  const assetId = existing[0]?.id ?? params.assetId;
  if (!existing[0]) {
    await conn.execute(INSERT_TEAM_ASSET, [
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
  await conn.execute(UPDATE_TEAM_LOGO, [assetId, params.teamId]);
  return assetId;
}

export async function findTeamLogo(conn: Conn, teamId: string) {
  const [rows] = await conn.execute<LogoRow[]>(SELECT_TEAM_LOGO, [teamId]);
  const r = rows[0];
  if (!r) return null;
  return {
    mimeType: r.mime_type,
    bytes: r.bytes,
    sha256: r.sha256,
  };
}
