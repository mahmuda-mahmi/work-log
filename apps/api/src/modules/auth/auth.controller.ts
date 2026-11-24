import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
  CreateTeamSchema,
  JoinByCodeSchema,
  LoginSchema,
  RegisterSchema,
  SubmitJoinRequestSchema,
  UpdateAvatarSchema,
  type AcceptInviteInput,
  type AuthSession,
  type BootstrapLeadInput,
  type ChangePasswordInput,
  type CompletePasswordResetInput,
  type CreateTeamInput,
  type JoinByCodeInput,
  type LoginInput,
  type RegisterInput,
  type SubmitJoinRequestInput,
  type UpdateAvatarInput,
} from '@cghq/contracts';
import type { Request, Response } from 'express';
import {
  type AuthenticatedRequest,
  invalidateSessionCache,
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
  listUserTeams,
  markInviteAccepted,
  markPasswordResetUsed,
  recordRateLimitFailure,
  setSessionActiveTeam,
  updateUserAvatar,
  updateUserLoginTimestamp,
  updateUserPassword,
  updateUserPasswordAndRevoke,
} from '../../db/repositories/auth.repo.js';
import { insertTeam, insertTeamMember } from '../../db/repositories/teams.repo.js';
import {
  findTeamNameById,
  upsertPendingJoinRequest,
} from '../../db/repositories/join-requests.repo.js';

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
    return {
      needsBootstrap: total === 0,
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    };
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
    if (user && user.isActive && !user.hasPassword) {
      throw new UnauthorizedException({
        code: 'GOOGLE_ACCOUNT_NO_PASSWORD',
        message:
          'This account was created with Google Sign-In and has no app password yet. Click "Continue with Google" below to sign in (you can set an app password in your Profile menu).',
      });
    }

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
        code: 'SESSION_INVALID',
        message: 'Could not establish session',
      });
    }

    setSessionCookie(res, rawToken);
    return { ok: true };
  }

  @Post('register')
  @HttpCode(200)
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pool = getPool();
    if (!pool) {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not configured',
      });
    }

    const email = body.email.trim().toLowerCase();
    const existing = await findUserForLogin(pool, email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists. Please sign in instead.',
      });
    }

    const userId = uuidv7();
    const passwordHash = await hashPassword(body.password);
    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    const sessionId = uuidv7();

    await withTransaction(pool, async (conn) => {
      await insertUser(conn, {
        id: userId,
        name: body.name.trim(),
        email,
        passwordHash,
      });
      await insertSession(conn, {
        id: sessionId,
        userId,
        tokenHash,
        sessionVersion: 0,
        ttlDays: SESSION_TTL_DAYS,
      });
    });

    setSessionCookie(res, rawToken);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (rawToken) {
      invalidateSessionCache(sha256Hex(rawToken));
    }
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
        avatarUrl: session.avatarUrl,
        hasPassword: session.hasPassword,
        authMethod: session.authMethod,
      },
      team: session.teamId
        ? {
            id: session.teamId,
            name: session.teamName!,
            slug: session.teamSlug!,
            timezone: session.teamTimezone!,
            documentTitle: session.documentTitle!,
            filePrefix: session.filePrefix!,
            preparedByDefault: session.preparedByDefault,
            hasLogo: session.hasLogo,
          }
        : null,
      member: session.memberId
        ? {
            id: session.memberId,
            role: session.role!,
            displayName: session.displayName!,
          }
        : null,
      pendingJoinTeamName: session.pendingJoinTeamName ?? null,
    };
  }

  @Post('teams')
  @UseGuards(SessionGuard)
  async createTeamForUser(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateTeamSchema)) body: CreateTeamInput,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const requestedSlug = body.teamSlug?.trim();
    const fallbackSlug =
      body.teamName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 60) || 'team';
    const rawSlugBase =
      requestedSlug || (fallbackSlug.length >= 2 ? fallbackSlug : `${fallbackSlug}01`);
    const teamId = uuidv7();
    const memberId = uuidv7();

    await withTransaction(pool, async (conn) => {
      const existingSlug = await conn.query<{ id: string }>(
        `SELECT id FROM teams WHERE LOWER(slug) = LOWER($1) LIMIT 1`,
        [rawSlugBase],
      );
      if (existingSlug.rows[0] && requestedSlug) {
        throw new ConflictException({
          code: 'TEAM_CODE_TAKEN',
          message: 'That Team Code is already in use. Choose another code.',
        });
      }
      const finalSlug = existingSlug.rows[0]
        ? `${rawSlugBase}-${Math.random().toString(36).slice(2, 6)}`
        : rawSlugBase;

      await insertTeam(conn, {
        id: teamId,
        name: body.teamName.trim(),
        slug: finalSlug,
        timezone: body.timezone,
        preparedByDefault: auth.userName,
        createdByUserId: auth.userId,
      });
      await insertTeamMember(conn, {
        id: memberId,
        teamId,
        userId: auth.userId,
        role: 'lead',
        displayName: auth.userName,
        sortOrder: 100,
      });
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'team.created',
        entityType: 'team',
        entityId: teamId,
      });
      await setSessionActiveTeam(conn, auth.sessionId, teamId);
    });

    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (rawToken) {
      invalidateSessionCache(sha256Hex(rawToken));
    }

    return { ok: true, teamId };
  }

  @Patch('avatar')
  @UseGuards(SessionGuard)
  async updateAvatar(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(UpdateAvatarSchema)) body: UpdateAvatarInput,
  ) {
    const pool = getPool()!;
    const avatarUrl = body.avatarUrl?.trim() || null;
    await updateUserAvatar(pool, req.auth!.userId, avatarUrl);
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (rawToken) {
      invalidateSessionCache(sha256Hex(rawToken));
    }
    return { avatarUrl };
  }

  @Get('teams')
  @UseGuards(SessionGuard)
  async getMyTeams(@Req() req: AuthenticatedRequest) {
    const pool = getPool()!;
    return listUserTeams(pool, req.auth!.userId);
  }

  @Post('teams/:teamId/switch')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async switchTeam(@Req() req: AuthenticatedRequest, @Param('teamId') teamId: string) {
    const pool = getPool()!;
    const teams = await listUserTeams(pool, req.auth!.userId);
    const target = teams.find((t) => t.teamId === teamId);
    if (!target) {
      throw new BadRequestException({
        code: 'TEAM_NOT_JOINED',
        message: 'You are not an active member of that team',
      });
    }
    await setSessionActiveTeam(pool, req.auth!.sessionId, teamId);
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (rawToken) {
      invalidateSessionCache(sha256Hex(rawToken));
    }
    return { ok: true, teamId };
  }

  @Post('join-by-code')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async joinByCode(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(JoinByCodeSchema)) body: JoinByCodeInput,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const rawInput = body.codeOrLink.trim();

    let extractedToken: string | null = null;
    const urlMatch = rawInput.match(/\/join\/([A-Za-z0-9_-]+)/);
    if (urlMatch?.[1]) {
      extractedToken = urlMatch[1];
    } else if (/^[A-Za-z0-9_-]{24,}$/.test(rawInput)) {
      extractedToken = rawInput;
    }

    let targetTeamId: string | null = null;
    let targetTeamName: string | null = null;

    if (extractedToken) {
      const invite = await findInviteByHash(pool, sha256Hex(extractedToken));
      if (invite && new Date(invite.expiresAt).getTime() > Date.now()) {
        targetTeamId = invite.teamId;
        targetTeamName = await findTeamNameById(pool, invite.teamId);
      }
    }

    if (!targetTeamId) {
      const slugLookup = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM teams WHERE LOWER(slug) = LOWER($1) LIMIT 1`,
        [rawInput],
      );
      if (slugLookup.rows[0]) {
        targetTeamId = slugLookup.rows[0].id;
        targetTeamName = slugLookup.rows[0].name;
      }
    }

    if (!targetTeamId) {
      throw new BadRequestException({
        code: 'TEAM_NOT_FOUND',
        message: 'No team matched that code or join link. Check with your Team Lead.',
      });
    }

    await withTransaction(pool, async (conn) => {
      await upsertPendingJoinRequest(conn, {
        id: uuidv7(),
        teamId: targetTeamId,
        userId: auth.userId,
        displayName: auth.userName,
        email: auth.userEmail,
      });
      await appendAuditEvent(conn, {
        teamId: targetTeamId,
        actorUserId: auth.userId,
        action: 'team.join_requested',
        entityType: 'join_request',
        entityId: auth.userId,
        metadata: { via: 'code', email: auth.userEmail },
      });
    });

    return { ok: true, teamName: targetTeamName ?? 'Team' };
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
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const activeSess = rawToken ? await findActiveSessionByTokenHash(pool, sha256Hex(rawToken)) : null;
    const user = await findUserForLogin(pool, auth.userEmail);
    if (!user) {
      throw new BadRequestException({
        code: 'USER_NOT_FOUND',
        message: 'User account not found',
      });
    }
    const requireCurrentPassword = user.hasPassword && activeSess?.authMethod !== 'google';
    if (requireCurrentPassword) {
      if (
        !body.currentPassword ||
        !(await verifyPassword(user.passwordHash, body.currentPassword))
      ) {
        throw new BadRequestException({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect',
        });
      }
    }

    const newHash = await hashPassword(body.newPassword);
    await withTransaction(pool, async (conn) => {
      await updateUserPassword(conn, auth.userId, newHash);
    });

    return { ok: true };
  }

  @Get('google')
  async googleAuthStart(
    @Req() req: Request,
    @Res() res: Response,
    @Query('next') next?: string,
    @Query('joinToken') joinToken?: string,
  ) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect('/login?error=google_not_configured');
    }

    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
      req.protocol ||
      'https';
    const host = (req.headers['x-forwarded-host'] as string | undefined) || req.get('host');
    const redirectUri = `${proto}://${host}/api/auth/google/callback`;

    const nonce = generateOpaqueToken(16);
    const safeNext = next && next.startsWith('/') ? next : '/today';
    const statePayload = JSON.stringify({
      nonce,
      next: safeNext,
      joinToken: joinToken?.trim() || null,
    });

    res.cookie('oauth_state', statePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: nonce,
      prompt: 'select_account',
    });

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  @Get('google/callback')
  async googleAuthCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const rawCookie = req.cookies?.['oauth_state'] as string | undefined;
    res.clearCookie('oauth_state', { path: '/' });

    if (!clientId || !clientSecret || !code || !state || !rawCookie) {
      return res.redirect('/login?error=google_auth_failed');
    }

    let parsedState: { nonce: string; next: string; joinToken: string | null };
    try {
      parsedState = JSON.parse(rawCookie) as {
        nonce: string;
        next: string;
        joinToken: string | null;
      };
    } catch {
      return res.redirect('/login?error=google_auth_failed');
    }

    if (parsedState.nonce !== state) {
      return res.redirect('/login?error=google_auth_failed');
    }

    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
      req.protocol ||
      'https';
    const host = (req.headers['x-forwarded-host'] as string | undefined) || req.get('host');
    const redirectUri = `${proto}://${host}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect('/login?error=google_auth_failed');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return res.redirect('/login?error=google_auth_failed');
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      return res.redirect('/login?error=google_auth_failed');
    }

    const profile = (await userInfoRes.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!profile.email || !profile.email_verified) {
      return res.redirect('/login?error=google_unverified_email');
    }

    const email = profile.email.trim().toLowerCase();
    const displayName = (profile.name?.trim() || email.split('@')[0] || 'Member').slice(0, 120);
    const googlePicture = profile.picture?.trim() || null;
    const pool = getPool()!;

    let user = await findUserForLogin(pool, email);
    if (!user) {
      const userId = uuidv7();
      const randomPasswordHash = await hashPassword(generateOpaqueToken(24));
      await withTransaction(pool, async (conn) => {
        await insertUser(conn, {
          id: userId,
          name: displayName,
          email,
          passwordHash: randomPasswordHash,
          hasPassword: false,
        });
        if (googlePicture) {
          await updateUserAvatar(conn, userId, googlePicture);
        }
      });
      user = await findUserForLogin(pool, email);
    } else if (googlePicture) {
      // Populate Google photo if user does not have a custom avatar yet
      await pool.query(
        `UPDATE users SET avatar_url = $1 WHERE id = $2 AND (avatar_url IS NULL OR avatar_url = '')`,
        [googlePicture, user.id],
      );
    }

    if (!user || !user.isActive) {
      return res.redirect('/login?error=account_disabled');
    }

    if (parsedState.joinToken) {
      const invite = await findInviteByHash(pool, sha256Hex(parsedState.joinToken));
      if (!invite || new Date(invite.expiresAt).getTime() <= Date.now()) {
        return res.redirect(`/join/${parsedState.joinToken}?error=invalid_link`);
      }

      const rawToken = generateOpaqueToken();
      const tokenHash = sha256Hex(rawToken);
      await withTransaction(pool, async (conn) => {
        await insertSession(conn, {
          id: uuidv7(),
          userId: user.id,
          tokenHash,
          sessionVersion: user.sessionVersion,
          ttlDays: SESSION_TTL_DAYS,
          authMethod: 'google',
        });
        await updateUserLoginTimestamp(conn, user.id);
      });

      const activeSession = await findActiveSessionByTokenHash(pool, tokenHash);
      if (activeSession && activeSession.teamId === invite.teamId) {
        setSessionCookie(res, rawToken);
        return res.redirect('/today');
      }

      await withTransaction(pool, async (conn) => {
        await upsertPendingJoinRequest(conn, {
          id: uuidv7(),
          teamId: invite.teamId,
          userId: user.id,
          displayName,
          email,
        });
        await appendAuditEvent(conn, {
          teamId: invite.teamId,
          actorUserId: user.id,
          action: 'team.join_requested',
          entityType: 'join_request',
          entityId: user.id,
          metadata: { via: 'google', email },
        });
      });

      return res.redirect(`/join/${parsedState.joinToken}?requested=1`);
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    await withTransaction(pool, async (conn) => {
      await insertSession(conn, {
        id: uuidv7(),
        userId: user.id,
        tokenHash,
        sessionVersion: user.sessionVersion,
        ttlDays: SESSION_TTL_DAYS,
        authMethod: 'google',
      });
      await updateUserLoginTimestamp(conn, user.id);
    });

    setSessionCookie(res, rawToken);
    return res.redirect(parsedState.next || '/today');
  }

  @Post('join-requests')
  @HttpCode(200)
  async submitJoinRequest(
    @Body(new ZodValidationPipe(SubmitJoinRequestSchema)) body: SubmitJoinRequestInput,
  ) {
    const pool = getPool()!;
    const invite = await findInviteByHash(pool, sha256Hex(body.token));
    if (!invite || new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'INVALID_JOIN_LINK',
        message: 'Join link is invalid or has expired',
      });
    }

    if (!body.email) {
      throw new BadRequestException({
        code: 'EMAIL_REQUIRED',
        message: 'Email address is required',
      });
    }

    const email = body.email.trim().toLowerCase();
    let existingUser = await findUserForLogin(pool, email);

    if (!existingUser) {
      if (!body.password) {
        throw new BadRequestException({
          code: 'PASSWORD_REQUIRED',
          message: 'Password (min 8 characters) is required for new accounts',
        });
      }
      const userId = uuidv7();
      const passwordHash = await hashPassword(body.password);
      await withTransaction(pool, async (conn) => {
        await insertUser(conn, {
          id: userId,
          name: body.name.trim(),
          email,
          passwordHash,
        });
      });
      existingUser = await findUserForLogin(pool, email);
    } else if (body.password) {
      const ok = await verifyPassword(existingUser.passwordHash, body.password);
      if (!ok) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Incorrect password for this existing email account',
        });
      }
    }

    if (!existingUser) {
      throw new BadRequestException({ code: 'USER_ERROR', message: 'Could not create user' });
    }

    const teamName = await withTransaction(pool, async (conn) => {
      await upsertPendingJoinRequest(conn, {
        id: uuidv7(),
        teamId: invite.teamId,
        userId: existingUser.id,
        displayName: body.name.trim(),
        email,
      });
      await appendAuditEvent(conn, {
        teamId: invite.teamId,
        actorUserId: existingUser.id,
        action: 'team.join_requested',
        entityType: 'join_request',
        entityId: existingUser.id,
        metadata: { via: 'form', email },
      });
      return findTeamNameById(conn, invite.teamId);
    });

    return { ok: true, status: 'pending', teamName: teamName ?? 'Team' };
  }
}
