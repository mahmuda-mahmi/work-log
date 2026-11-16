import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { TeamJoinRequestDto } from '@cghq/contracts';

type Conn = Pool | PoolConnection;

let tableEnsured = false;

export async function ensureJoinRequestsTable(conn: Conn): Promise<void> {
  if (tableEnsured) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS team_join_requests (
      id CHAR(36) NOT NULL,
      team_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      reviewed_by_user_id CHAR(36) NULL,
      reviewed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY team_join_requests_uq (team_id, user_id),
      KEY team_join_requests_team_status_idx (team_id, status, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  tableEnsured = true;
}

type JoinRequestRow = RowDataPacket & {
  id: string;
  team_id: string;
  user_id: string;
  display_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date | string;
};

export async function upsertPendingJoinRequest(
  conn: Conn,
  params: {
    id: string;
    teamId: string;
    userId: string;
    displayName: string;
    email: string;
  },
): Promise<void> {
  await ensureJoinRequestsTable(conn);
  await conn.execute(
    `
    INSERT INTO team_join_requests (id, team_id, user_id, display_name, email, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
    ON DUPLICATE KEY UPDATE
      display_name = VALUES(display_name),
      email = VALUES(email),
      status = 'pending',
      reviewed_by_user_id = NULL,
      reviewed_at = NULL
    `,
    [params.id, params.teamId, params.userId, params.displayName, params.email],
  );
}

export async function listPendingJoinRequests(
  conn: Conn,
  teamId: string,
): Promise<TeamJoinRequestDto[]> {
  await ensureJoinRequestsTable(conn);
  const [rows] = await conn.execute<JoinRequestRow[]>(
    `
    SELECT id, team_id, user_id, display_name, email, status, created_at
    FROM team_join_requests
    WHERE team_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    `,
    [teamId],
  );
  return rows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    userId: r.user_id,
    name: r.display_name,
    email: r.email,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function findJoinRequestById(
  conn: Conn,
  teamId: string,
  requestId: string,
): Promise<JoinRequestRow | null> {
  await ensureJoinRequestsTable(conn);
  const [rows] = await conn.execute<JoinRequestRow[]>(
    `
    SELECT id, team_id, user_id, display_name, email, status, created_at
    FROM team_join_requests
    WHERE id = ? AND team_id = ?
    LIMIT 1
    `,
    [requestId, teamId],
  );
  return rows[0] ?? null;
}

export async function markJoinRequestStatus(
  conn: Conn,
  params: {
    teamId: string;
    requestId: string;
    status: 'approved' | 'rejected';
    reviewedByUserId: string;
  },
): Promise<void> {
  await ensureJoinRequestsTable(conn);
  await conn.execute(
    `
    UPDATE team_join_requests
    SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP(3)
    WHERE id = ? AND team_id = ?
    `,
    [params.status, params.reviewedByUserId, params.requestId, params.teamId],
  );
}

export async function findTeamNameById(conn: Conn, teamId: string): Promise<string | null> {
  const [rows] = await conn.execute<Array<RowDataPacket & { name: string }>>(
    `SELECT name FROM teams WHERE id = ? LIMIT 1`,
    [teamId],
  );
  return rows[0]?.name ?? null;
}

export async function upsertActiveTeamMember(
  conn: Conn,
  params: {
    id: string;
    teamId: string;
    userId: string;
    displayName: string;
  },
): Promise<void> {
  await conn.execute(
    `
    INSERT INTO team_members (id, team_id, user_id, role, display_name, is_active)
    VALUES (?, ?, ?, 'member', ?, 1)
    ON DUPLICATE KEY UPDATE
      display_name = VALUES(display_name),
      is_active = 1
    `,
    [params.id, params.teamId, params.userId, params.displayName],
  );
}
