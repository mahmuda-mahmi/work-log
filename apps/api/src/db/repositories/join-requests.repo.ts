import type { TeamJoinRequestDto } from '@cghq/contracts';
import type { DbClient } from '../pool.js';

type JoinRequestRow = {
  id: string;
  team_id: string;
  user_id: string;
  display_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date | string;
};

export async function upsertPendingJoinRequest(
  conn: DbClient,
  params: {
    id: string;
    teamId: string;
    userId: string;
    displayName: string;
    email: string;
  },
): Promise<void> {
  await conn.query(
    `
    INSERT INTO team_join_requests (id, team_id, user_id, display_name, email, status)
    VALUES ($1, $2, $3, $4, $5, 'pending')
    ON CONFLICT (team_id, user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      status = 'pending',
      reviewed_by_user_id = NULL,
      reviewed_at = NULL
    `,
    [params.id, params.teamId, params.userId, params.displayName, params.email],
  );
}

export async function listPendingJoinRequests(
  conn: DbClient,
  teamId: string,
): Promise<TeamJoinRequestDto[]> {
  const res = await conn.query<JoinRequestRow>(
    `
    SELECT id, team_id, user_id, display_name, email, status, created_at
    FROM team_join_requests
    WHERE team_id = $1 AND status = 'pending'
    ORDER BY created_at DESC
    `,
    [teamId],
  );
  return res.rows.map((r) => ({
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
  conn: DbClient,
  teamId: string,
  requestId: string,
): Promise<JoinRequestRow | null> {
  const res = await conn.query<JoinRequestRow>(
    `
    SELECT id, team_id, user_id, display_name, email, status, created_at
    FROM team_join_requests
    WHERE id = $1 AND team_id = $2
    LIMIT 1
    `,
    [requestId, teamId],
  );
  return res.rows[0] ?? null;
}

export async function markJoinRequestStatus(
  conn: DbClient,
  params: {
    teamId: string;
    requestId: string;
    status: 'approved' | 'rejected';
    reviewedByUserId: string;
  },
): Promise<void> {
  await conn.query(
    `
    UPDATE team_join_requests
    SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW()
    WHERE id = $3 AND team_id = $4
    `,
    [params.status, params.reviewedByUserId, params.requestId, params.teamId],
  );
}

export async function findTeamNameById(conn: DbClient, teamId: string): Promise<string | null> {
  const res = await conn.query<{ name: string }>(`SELECT name FROM teams WHERE id = $1 LIMIT 1`, [
    teamId,
  ]);
  return res.rows[0]?.name ?? null;
}

export async function upsertActiveTeamMember(
  conn: DbClient,
  params: {
    id: string;
    teamId: string;
    userId: string;
    displayName: string;
  },
): Promise<void> {
  await conn.query(
    `
    INSERT INTO team_members (id, team_id, user_id, role, display_name, is_active)
    VALUES ($1, $2, $3, 'member', $4, TRUE)
    ON CONFLICT (team_id, user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      is_active = TRUE
    `,
    [params.id, params.teamId, params.userId, params.displayName],
  );
}
