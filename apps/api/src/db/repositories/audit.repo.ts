import type { DbClient } from '../pool.js';
import { INSERT_AUDIT_EVENT } from '../sql/audit.sql.js';

export async function appendAuditEvent(
  conn: DbClient,
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
  await conn.query(INSERT_AUDIT_EVENT, [
    params.teamId,
    params.actorUserId,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.requestId ?? null,
    JSON.stringify(params.metadata ?? {}),
  ]);
}
