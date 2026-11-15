import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const LOCK_NAME = 'cghq:migrate';
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations');

type AppliedRow = mysql.RowDataPacket & {
  version: string;
  checksum: string;
};

type LockRow = mysql.RowDataPacket & {
  acquired: number | null;
};

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    multipleStatements: true,
    timezone: '+00:00',
  });

  try {
    const [lockRows] = await conn.query<LockRow[]>('SELECT GET_LOCK(?, 30) AS acquired', [LOCK_NAME]);
    if (lockRows[0]?.acquired !== 1) {
      throw new Error(`Could not acquire migration lock "${LOCK_NAME}"`);
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(64) NOT NULL,
        checksum   CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    const [appliedRows] = await conn.execute<AppliedRow[]>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version ASC',
    );
    const appliedMap = new Map(appliedRows.map((r) => [r.version, r.checksum]));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
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
      await conn.query(sql);
      await conn.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [
        version,
        checksum,
      ]);
      console.log(`✓ Applied ${version}`);
    }
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
