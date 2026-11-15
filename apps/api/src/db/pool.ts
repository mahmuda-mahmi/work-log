import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';

let pool: Pool | null = null;

/**
 * Returns the module-level mysql2 pool configured for serverless functions.
 */
export function getPool(): Pool | null {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    return null;
  }
  if (!pool) {
    pool = mysql.createPool({
      uri,
      connectionLimit: 2,
      maxIdle: 1,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      timezone: '+00:00',
    });
  }
  return pool;
}

const RETRYABLE_ERRNOS = new Set([1213, 1205]);

/**
 * Runs a callback inside a MySQL transaction with deadlock/lock-timeout retry.
 */
export async function withTransaction<T>(
  p: Pool,
  fn: (conn: PoolConnection) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      const errno = (err as { errno?: number } | null)?.errno;
      if (errno !== undefined && RETRYABLE_ERRNOS.has(errno) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
  throw new Error('Transaction retry exhausted');
}
