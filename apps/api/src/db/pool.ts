import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export type DbClient = Pool | PoolClient;

let pool: Pool | null = null;

/**
 * Returns the module-level PostgreSQL pool configured for serverless functions.
 */
export function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  if (!pool) {
    const isLocal =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    });
  }
  return pool;
}

export function dbQuery<T extends QueryResultRow = QueryResultRow>(
  conn: DbClient,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return conn.query<T>(text, params);
}

const RETRYABLE_PG_CODES = new Set(['40001', '40P01']);

/**
 * Runs a callback inside a PostgreSQL transaction with serialization/deadlock retry.
 */
export async function withTransaction<T>(
  p: Pool,
  fn: (client: PoolClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (err as { code?: string } | null)?.code;
      if (code !== undefined && RETRYABLE_PG_CODES.has(code) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
  throw new Error('Transaction retry exhausted');
}
