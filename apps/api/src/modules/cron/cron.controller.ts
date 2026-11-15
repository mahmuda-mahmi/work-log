import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { getPool } from '../../db/pool.js';
import { runDatabaseCleanup } from '../../db/repositories/cron.repo.js';

export function isAuthorizedCronRequest(
  authHeader: string | undefined,
  cronSecret: string | undefined,
): boolean {
  if (!cronSecret) return true;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authHeader.slice('Bearer '.length));
  const expected = Buffer.from(cronSecret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

@Controller('cron')
export class CronController {
  @Get('cleanup')
  async cleanup(@Headers('authorization') authHeader?: string) {
    if (!isAuthorizedCronRequest(authHeader, process.env.CRON_SECRET)) {
      throw new UnauthorizedException({
        code: 'INVALID_CRON_SECRET',
        message: 'Unauthorized cron invocation',
      });
    }

    const pool = getPool();
    if (!pool) {
      return {
        ok: true,
        skipped: true,
        deleted: { sessions: 0, invites: 0, passwordResets: 0, rateLimits: 0 },
      };
    }

    const deleted = await runDatabaseCleanup(pool);
    return { ok: true, deleted };
  }
}
