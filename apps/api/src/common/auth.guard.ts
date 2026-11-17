import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { MemberRole } from '@cghq/contracts';
import type { Request } from 'express';
import { sha256Hex } from './crypto.js';
import { getPool } from '../db/pool.js';
import {
  findActiveSessionByTokenHash,
  touchSessionActivity,
} from '../db/repositories/auth.repo.js';

export interface AuthContext {
  sessionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamTimezone: string;
  memberId: string;
  role: MemberRole;
  displayName: string;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };

export const SESSION_COOKIE_NAME = 'sid';
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SESSION_CACHE_TTL_MS = 30_000;

const sessionCache = new Map<string, { auth: AuthContext; expiresAtMs: number }>();

export function invalidateSessionCache(tokenHash?: string): void {
  if (tokenHash) {
    sessionCache.delete(tokenHash);
  } else {
    sessionCache.clear();
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }

    const tokenHash = sha256Hex(rawToken);
    const cached = sessionCache.get(tokenHash);
    if (cached && cached.expiresAtMs > Date.now()) {
      req.auth = cached.auth;
      return true;
    }

    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }

    const session = await findActiveSessionByTokenHash(pool, tokenHash);
    if (!session) {
      sessionCache.delete(tokenHash);
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Session is invalid or expired',
      });
    }

    const nowMs = Date.now();
    const idleMs = nowMs - new Date(session.lastActiveAt).getTime();
    if (idleMs > IDLE_TIMEOUT_MS) {
      sessionCache.delete(tokenHash);
      throw new UnauthorizedException({
        code: 'SESSION_IDLE_EXPIRED',
        message: 'Session expired due to inactivity',
      });
    }

    if (idleMs > TOUCH_INTERVAL_MS) {
      await touchSessionActivity(pool, session.sessionId).catch(() => undefined);
    }

    const auth: AuthContext = {
      sessionId: session.sessionId,
      userId: session.userId,
      userName: session.userName,
      userEmail: session.userEmail,
      avatarUrl: session.avatarUrl,
      teamId: session.teamId ?? '',
      teamName: session.teamName ?? '',
      teamSlug: session.teamSlug ?? '',
      teamTimezone: session.teamTimezone ?? 'Asia/Dhaka',
      memberId: session.memberId ?? '',
      role: session.role ?? 'member',
      displayName: session.displayName ?? session.userName,
    };

    if (session.teamId) {
      sessionCache.set(tokenHash, {
        auth,
        expiresAtMs: nowMs + SESSION_CACHE_TTL_MS,
      });
    }
    req.auth = auth;

    return true;
  }
}

@Injectable()
export class TeamScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const teamIdParam = req.params?.teamId;
    if (!req.auth || !teamIdParam || req.auth.teamId !== teamIdParam) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_TEAM',
        message: 'You do not have access to this team',
      });
    }
    return true;
  }
}

@Injectable()
export class TeamLeadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.auth || req.auth.role !== 'lead') {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Team Lead role is required for this action',
      });
    }
    return true;
  }
}
