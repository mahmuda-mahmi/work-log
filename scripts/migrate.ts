import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations');

type AppliedRow = {
  version: string;
  checksum: string;
};

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  const client = new Client({
    connectionString: databaseUrl,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(64) PRIMARY KEY,
        checksum   CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRes = await client.query<AppliedRow>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version ASC',
    );
    const appliedMap = new Map(appliedRes.rows.map((r) => [r.version, r.checksum]));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('_pg.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
      const checksum = sha256(sql);

      const existingChecksum = appliedMap.get(version);
      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Checksum drift detected for migration ${version}: expected ${existingChecksum}, got ${checksum}`,
          );
        }
        console.log(`✓ ${version} (already applied)`);
        continue;
      }

      console.log(`→ Applying ${version}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          version,
          checksum,
        ]);
        await client.query('COMMIT');
        console.log(`✓ ${version} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
