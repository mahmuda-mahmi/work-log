import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AcceptInviteSchema,
  BootstrapLeadSchema,
  ChangePasswordSchema,
  CompletePasswordResetSchema,
  LoginSchema,
  type AcceptInviteInput,
  type AuthSession,
  type BootstrapLeadInput,
  type ChangePasswordInput,
  type CompletePasswordResetInput,
  type LoginInput,
} from '@cghq/contracts';
import type { Request, Response } from 'express';
import {
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  SessionGuard,
} from '../../common/auth.guard.js';
import { generateOpaqueToken, sha256Hex } from '../../common/crypto.js';
import { hashPassword, verifyPassword } from '../../common/password.js';
import { uuidv7 } from '../../common/uuid.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { getPool, withTransaction } from '../../db/pool.js';
import { appendAuditEvent } from '../../db/repositories/audit.repo.js';
import {
  clearRateLimit,
  countUsers,
  deleteSessionById,
  findActiveSessionByTokenHash,
  findInviteByHash,
  findPasswordResetByHash,
  findUserForLogin,
  getRateLimitLock,
  insertSession,
  insertUser,
  markInviteAccepted,
  markPasswordResetUsed,
  recordRateLimitFailure,
  updateUserLoginTimestamp,
  updateUserPasswordAndRevoke,
} from '../../db/repositories/auth.repo.js';
import { insertTeam, insertTeamMember } from '../../db/repositories/teams.repo.js';

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

function setSessionCookie(res: Response, rawToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0]!.trim();
  }
  return req.ip || 'unknown';
}

@Controller('auth')
export class AuthController {
  @Get('bootstrap-status')
  async getBootstrapStatus() {
    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }
    const total = await countUsers(pool);
    return { needsBootstrap: total === 0 };
  }

  @Post('bootstrap')
  async bootstrapLead(
    @Body(new ZodValidationPipe(BootstrapLeadSchema)) body: BootstrapLeadInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }

    const passwordHash = await hashPassword(body.password);
    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    const userId = uuidv7();
    const teamId = uuidv7();
    const memberId = uuidv7();
    const sessionId = uuidv7();

    await withTransaction(pool, async (conn) => {
      const existingCount = await countUsers(conn);
      if (existingCount > 0) {
        throw new ConflictException({
          code: 'ALREADY_BOOTSTRAPPED',
          message: 'Initial team setup has already been completed',
        });
      }

      await insertUser(conn, {
        id: userId,
        name: body.name,
        email: body.email,
        passwordHash,
      });

      await insertTeam(conn, {
        id: teamId,
        name: body.teamName,
        slug: body.teamSlug,
        timezone: body.timezone,
        preparedByDefault: body.name,
        createdByUserId: userId,
      });

      await insertTeamMember(conn, {
        id: memberId,
        teamId,
        userId,
        role: 'lead',
        displayName: body.name,
        sortOrder: 10,
      });

      await insertSession(conn, {
        id: sessionId,
        userId,
        tokenHash,
        sessionVersion: 0,
        ttlDays: SESSION_TTL_DAYS,
      });

      await appendAuditEvent(conn, {
        teamId,
        actorUserId: userId,
        action: 'team.bootstrapped',
        entityType: 'team',
        entityId: teamId,
      });
    });

    setSessionCookie(res, rawToken);
    return { ok: true, teamId, userId };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }

    const ip = getClientIp(req);
    const ipBucket = `login:ip:${ip}`;
    const acctBucket = `login:acct:${body.email}`;

    const [ipLock, acctLock] = await Promise.all([
      getRateLimitLock(pool, ipBucket),
      getRateLimitLock(pool, acctBucket),
    ]);
    if (ipLock || acctLock) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many failed login attempts. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await findUserForLogin(pool, body.email);
    const valid = user && user.isActive ? await verifyPassword(user.passwordHash, body.password) : false;

    if (!user || !valid) {
      await Promise.all([
        recordRateLimitFailure(pool, ipBucket),
        recordRateLimitFailure(pool, acctBucket),
      ]);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    await Promise.all([clearRateLimit(pool, ipBucket), clearRateLimit(pool, acctBucket)]);

    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    const sessionId = uuidv7();

    await withTransaction(pool, async (conn) => {
      await insertSession(conn, {
        id: sessionId,
        userId: user.id,
        tokenHash,
        sessionVersion: user.sessionVersion,
        ttlDays: SESSION_TTL_DAYS,
      });
      await updateUserLoginTimestamp(conn, user.id);
    });

    const session = await findActiveSessionByTokenHash(pool, tokenHash);
    if (!session) {
      throw new UnauthorizedException({
        code: 'NO_ACTIVE_TEAM',
        message: 'Your account is not active on any team',
      });
    }

    setSessionCookie(res, rawToken);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const pool = getPool();
    if (pool && req.auth) {
      await deleteSessionById(pool, req.auth.sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<AuthSession> {
    const pool = getPool()!;
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string;
    const session = await findActiveSessionByTokenHash(pool, sha256Hex(rawToken));
    if (!session) {
      throw new UnauthorizedException({ code: 'SESSION_INVALID', message: 'Session invalid' });
    }
    return {
      user: {
        id: session.userId,
        name: session.userName,
        email: session.userEmail,
      },
      team: {
        id: session.teamId,
        name: session.teamName,
        slug: session.teamSlug,
        timezone: session.teamTimezone,
        documentTitle: session.documentTitle,
        filePrefix: session.filePrefix,
        preparedByDefault: session.preparedByDefault,
        hasLogo: session.hasLogo,
      },
      member: {
        id: session.memberId,
        role: session.role,
        displayName: session.displayName,
      },
    };
  }

  @Post('invites/accept')
  @HttpCode(200)
  async acceptInvite(
    @Body(new ZodValidationPipe(AcceptInviteSchema)) body: AcceptInviteInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }

    const ipBucket = `invite:ip:${getClientIp(req)}`;
    if (await getRateLimitLock(pool, ipBucket)) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many invalid invite attempts. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const inviteHash = sha256Hex(body.token);
    const invite = await findInviteByHash(pool, inviteHash);
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      await recordRateLimitFailure(pool, ipBucket);
      throw new BadRequestException({
        code: 'INVALID_INVITE',
        message: 'Invite link is invalid or expired',
      });
    }

    if (invite.email && invite.email.toLowerCase() !== body.email.toLowerCase()) {
      await recordRateLimitFailure(pool, ipBucket);
      throw new BadRequestException({
        code: 'INVITE_EMAIL_MISMATCH',
        message: 'This invite was issued for a different email address',
      });
    }

    const passwordHash = await hashPassword(body.password);
    const rawSessionToken = generateOpaqueToken();
    const sessionHash = sha256Hex(rawSessionToken);
    const userId = uuidv7();
    const memberId = uuidv7();
    const sessionId = uuidv7();

    await withTransaction(pool, async (conn) => {
      const existingUser = await findUserForLogin(conn, body.email);
      if (existingUser) {
        throw new ConflictException({
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists',
        });
      }

      await insertUser(conn, {
        id: userId,
        name: body.name,
        email: body.email,
        passwordHash,
      });

      const claimed = await markInviteAccepted(conn, invite.id, userId);
      if (!claimed) {
        throw new BadRequestException({
          code: 'INVALID_INVITE',
          message: 'Invite has already been used',
        });
      }

      await insertTeamMember(conn, {
        id: memberId,
        teamId: invite.teamId,
        userId,
        role: invite.role,
        displayName: body.name,
      });

      await insertSession(conn, {
        id: sessionId,
        userId,
        tokenHash: sessionHash,
        sessionVersion: 0,
        ttlDays: SESSION_TTL_DAYS,
      });

      await appendAuditEvent(conn, {
        teamId: invite.teamId,
        actorUserId: userId,
        action: 'member.joined',
        entityType: 'team_member',
        entityId: memberId,
        metadata: { role: invite.role },
      });
    });

    await clearRateLimit(pool, ipBucket);
    setSessionCookie(res, rawSessionToken);
    return { ok: true, teamId: invite.teamId };
  }

  @Post('password-resets/complete')
  @HttpCode(200)
  async completePasswordReset(
    @Body(new ZodValidationPipe(CompletePasswordResetSchema)) body: CompletePasswordResetInput,
  ) {
    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }

    const reset = await findPasswordResetByHash(pool, sha256Hex(body.token));
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Password reset link is invalid or expired',
      });
    }

    const newHash = await hashPassword(body.newPassword);

    await withTransaction(pool, async (conn) => {
      const marked = await markPasswordResetUsed(conn, reset.id);
      if (!marked) {
        throw new BadRequestException({
          code: 'INVALID_RESET_TOKEN',
          message: 'Password reset link has already been used',
        });
      }
      await updateUserPasswordAndRevoke(conn, reset.userId, newHash);
    });

    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const user = await findUserForLogin(pool, auth.userEmail);
    if (!user || !(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      });
    }

    const newHash = await hashPassword(body.newPassword);
    await withTransaction(pool, async (conn) => {
      await updateUserPasswordAndRevoke(conn, auth.userId, newHash);
    });

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}
