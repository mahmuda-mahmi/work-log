import type { Pool, PoolConnection } from 'mysql2/promise';
import { INSERT_AUDIT_EVENT } from '../sql/audit.sql.js';

type Conn = Pool | PoolConnection;

export async function appendAuditEvent(
  conn: Conn,
  params: {
    teamId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await conn.execute(INSERT_AUDIT_EVENT, [
    params.teamId,
    params.actorUserId,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.requestId ?? null,
    JSON.stringify(params.metadata ?? {}),
  ]);
}
