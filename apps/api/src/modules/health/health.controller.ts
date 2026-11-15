import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@cghq/contracts';
import { getPool } from '../../db/pool.js';
import { checkDatabaseHealth } from '../../db/repositories/health.repo.js';

@Controller('health')
export class HealthController {
  @Get()
  async getHealth(): Promise<HealthResponse> {
    const pool = getPool();
    if (!pool) {
      return {
        status: 'degraded',
        db: 'down',
        migrationVersion: null,
        timestamp: new Date().toISOString(),
      };
    }

    const dbHealth = await checkDatabaseHealth(pool);
    return {
      status: dbHealth.db === 'up' ? 'ok' : 'degraded',
      db: dbHealth.db,
      migrationVersion: dbHealth.migrationVersion,
      timestamp: new Date().toISOString(),
    };
  }
}
