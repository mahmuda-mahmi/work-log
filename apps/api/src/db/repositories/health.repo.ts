import type { Pool, RowDataPacket } from 'mysql2/promise';
import { SELECT_DB_PING, SELECT_LATEST_MIGRATION } from '../sql/health.sql.js';

type PingRow = RowDataPacket & { ok: number };
type MigrationRow = RowDataPacket & { version: string };

export async function checkDatabaseHealth(pool: Pool): Promise<{
  db: 'up' | 'down';
  migrationVersion: string | null;
}> {
  try {
    await pool.execute<PingRow[]>(SELECT_DB_PING, []);
    const [rows] = await pool.execute<MigrationRow[]>(SELECT_LATEST_MIGRATION, []);
    return {
      db: 'up',
      migrationVersion: rows[0]?.version ?? null,
    };
  } catch {
    return {
      db: 'down',
      migrationVersion: null,
    };
  }
}
