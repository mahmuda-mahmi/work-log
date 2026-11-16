import type { Pool } from 'pg';
import { SELECT_DB_PING, SELECT_LATEST_MIGRATION } from '../sql/health.sql.js';

type MigrationRow = { version: string };

export async function checkDatabaseHealth(pool: Pool): Promise<{
  db: 'up' | 'down';
  migrationVersion: string | null;
}> {
  try {
    await pool.query(SELECT_DB_PING);
    const res = await pool.query<MigrationRow>(SELECT_LATEST_MIGRATION);
    return {
      db: 'up',
      migrationVersion: res.rows[0]?.version ?? null,
    };
  } catch {
    return {
      db: 'down',
      migrationVersion: null,
    };
  }
}
