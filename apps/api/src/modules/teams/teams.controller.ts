import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  CreateInviteSchema,
  UpdateMemberProfileSchema,
  UpdateMemberRoleSchema,
  UpdateTeamSettingsSchema,
  type CreateInviteInput,
  type UpdateMemberProfileInput,
  type UpdateMemberRoleInput,
  type UpdateTeamSettingsInput,
} from '@cghq/contracts';
import type { Response } from 'express';
import {
  type AuthenticatedRequest,
  invalidateSessionCache,
  SessionGuard,
  TeamLeadGuard,
  TeamScopeGuard,
} from '../../common/auth.guard.js';
import { generateOpaqueToken, sha256Hex } from '../../common/crypto.js';
import { sniffLogoImage } from '../../common/image-sniff.js';
import { uuidv7 } from '../../common/uuid.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { getPool, withTransaction } from '../../db/pool.js';
import { appendAuditEvent } from '../../db/repositories/audit.repo.js';
import { deleteSessionsByUserId } from '../../db/repositories/auth.repo.js';
import {
  findJoinRequestById,
  listPendingJoinRequests,
  markJoinRequestStatus,
  upsertActiveTeamMember,
} from '../../db/repositories/join-requests.repo.js';
import {
  countActiveLeads,
  deactivateTeamMember,
  findTeamLogo,
  findTeamMemberById,
  findTeamSettings,
  insertInvite,
  insertPasswordReset,
  listTeamMembers,
  updateMemberDisplayName,
  updateMemberRole,
  updateTeamSettings,
  upsertTeamLogo,
} from '../../db/repositories/teams.repo.js';

@Controller('teams/:teamId')
@UseGuards(SessionGuard, TeamScopeGuard)
export class TeamsController {
  @Get('settings')
  async getSettings(@Param('teamId') teamId: string) {
    const pool = getPool()!;
    const settings = await findTeamSettings(pool, teamId);
    if (!settings) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team not found' });
    }
    return settings;
  }

  @Patch('settings')
  @UseGuards(TeamLeadGuard)
  async patchSettings(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(UpdateTeamSettingsSchema)) body: UpdateTeamSettingsInput,
  ) {
    const pool = getPool()!;
    const current = await findTeamSettings(pool, teamId);
    if (!current) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team not found' });
    }

    const next = {
      name: body.name ?? current.name,
      documentTitle: body.documentTitle ?? current.documentTitle,
      filePrefix: body.filePrefix ?? current.filePrefix,
      timezone: body.timezone ?? current.timezone,
      preparedByDefault:
        body.preparedByDefault !== undefined ? body.preparedByDefault : current.preparedByDefault,
      membersCanAddDictionary: body.membersCanAddDictionary ?? current.membersCanAddDictionary,
      followupsEnabled: body.followupsEnabled ?? current.followupsEnabled,
      documentFontFamily: body.documentFontFamily ?? current.documentFontFamily,
      documentFontSizePt: body.documentFontSizePt ?? current.documentFontSizePt,
    };

    await withTransaction(pool, async (conn) => {
      await updateTeamSettings(conn, teamId, next);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'team.settings_updated',
        entityType: 'team',
        entityId: teamId,
      });
    });

    return findTeamSettings(pool, teamId);
  }

  @Patch('profile')
  async updateMyProfile(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(UpdateMemberProfileSchema)) body: UpdateMemberProfileInput,
  ) {
    const pool = getPool()!;
    const displayName = body.displayName.trim();

    await withTransaction(pool, async (conn) => {
      await updateMemberDisplayName(conn, teamId, req.auth!.memberId, displayName);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'member.profile_updated',
        entityType: 'team_member',
        entityId: req.auth!.memberId,
        metadata: { displayName },
      });
    });

    invalidateSessionCache();
    return { displayName };
  }

  @Get('members')
  async getMembers(@Param('teamId') teamId: string) {
    const pool = getPool()!;
    return listTeamMembers(pool, teamId);
  }

  @Post('invites')
  @UseGuards(TeamLeadGuard)
  async createInvite(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateInviteSchema)) body: CreateInviteInput,
  ) {
    const pool = getPool()!;
    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    const inviteId = uuidv7();

    await withTransaction(pool, async (conn) => {
      await insertInvite(conn, {
        id: inviteId,
        teamId,
        email: body.email ?? null,
        role: body.role,
        tokenHash,
        createdByUserId: req.auth!.userId,
      });
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'member.invited',
        entityType: 'invite',
        entityId: inviteId,
        metadata: { role: body.role, hasEmail: Boolean(body.email) },
      });
    });

    return {
      inviteId,
      token: rawToken,
      invitePath: `/invite/${rawToken}`,
      role: body.role,
    };
  }

  @Post('join-link')
  @UseGuards(TeamLeadGuard)
  async createJoinLink(@Param('teamId') teamId: string, @Req() req: AuthenticatedRequest) {
    const pool = getPool()!;
    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    const inviteId = uuidv7();

    await withTransaction(pool, async (conn) => {
      await insertInvite(conn, {
        id: inviteId,
        teamId,
        email: null,
        role: 'member',
        tokenHash,
        createdByUserId: req.auth!.userId,
      });
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'team.join_link_created',
        entityType: 'invite',
        entityId: inviteId,
      });
    });

    return {
      inviteId,
      token: rawToken,
      joinPath: `/join/${rawToken}`,
    };
  }

  @Get('join-requests')
  @UseGuards(TeamLeadGuard)
  async getJoinRequests(@Param('teamId') teamId: string) {
    const pool = getPool()!;
    return listPendingJoinRequests(pool, teamId);
  }

  @Post('join-requests/:requestId/approve')
  @UseGuards(TeamLeadGuard)
  async approveJoinRequest(
    @Param('teamId') teamId: string,
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      const request = await findJoinRequestById(conn, teamId, requestId);
      if (!request || request.status !== 'pending') {
        throw new NotFoundException({
          code: 'JOIN_REQUEST_NOT_FOUND',
          message: 'Pending join request not found',
        });
      }

      await upsertActiveTeamMember(conn, {
        id: uuidv7(),
        teamId,
        userId: request.user_id,
        displayName: request.display_name,
      });

      await markJoinRequestStatus(conn, {
        teamId,
        requestId,
        status: 'approved',
        reviewedByUserId: req.auth!.userId,
      });

      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'team.join_request_approved',
        entityType: 'join_request',
        entityId: requestId,
        metadata: { userId: request.user_id, email: request.email },
      });
    });

    return { ok: true };
  }

  @Post('join-requests/:requestId/reject')
  @UseGuards(TeamLeadGuard)
  async rejectJoinRequest(
    @Param('teamId') teamId: string,
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      const request = await findJoinRequestById(conn, teamId, requestId);
      if (!request || request.status !== 'pending') {
        throw new NotFoundException({
          code: 'JOIN_REQUEST_NOT_FOUND',
          message: 'Pending join request not found',
        });
      }

      await markJoinRequestStatus(conn, {
        teamId,
        requestId,
        status: 'rejected',
        reviewedByUserId: req.auth!.userId,
      });

      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'team.join_request_rejected',
        entityType: 'join_request',
        entityId: requestId,
        metadata: { userId: request.user_id, email: request.email },
      });
    });

    return { ok: true };
  }

  @Patch('members/:memberId/role')
  @UseGuards(TeamLeadGuard)
  async changeRole(
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(UpdateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      const target = await findTeamMemberById(conn, teamId, memberId);
      if (!target || !target.isActive) {
        throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Active member not found' });
      }

      if (target.role === 'lead' && body.role !== 'lead') {
        const leadCount = await countActiveLeads(conn, teamId);
        if (leadCount <= 1) {
          throw new ConflictException({
            code: 'LAST_LEAD_REQUIRED',
            message: 'A team must always have at least one Team Lead',
          });
        }
      }

      await updateMemberRole(conn, teamId, memberId, body.role);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'member.role_changed',
        entityType: 'team_member',
        entityId: memberId,
        metadata: { from: target.role, to: body.role },
      });
    });

    return { ok: true };
  }

  @Delete('members/:memberId')
  @UseGuards(TeamLeadGuard)
  async removeMember(
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      const target = await findTeamMemberById(conn, teamId, memberId);
      if (!target || !target.isActive) {
        throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Active member not found' });
      }

      if (target.role === 'lead') {
        const leadCount = await countActiveLeads(conn, teamId);
        if (leadCount <= 1) {
          throw new ConflictException({
            code: 'LAST_LEAD_REQUIRED',
            message: 'Cannot remove the last Team Lead',
          });
        }
      }

      await deactivateTeamMember(conn, teamId, memberId);
      await conn.query(
        `UPDATE sessions SET active_team_id = NULL WHERE user_id = $1 AND active_team_id = $2`,
        [target.userId, teamId],
      );
      invalidateSessionCache();
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'member.removed',
        entityType: 'team_member',
        entityId: memberId,
      });
    });

    return { ok: true };
  }

  @Post('members/:memberId/password-reset')
  @UseGuards(TeamLeadGuard)
  async issuePasswordReset(
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const target = await findTeamMemberById(pool, teamId, memberId);
    if (!target || !target.isActive) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Active member not found' });
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = sha256Hex(rawToken);
    const resetId = uuidv7();

    await withTransaction(pool, async (conn) => {
      await insertPasswordReset(conn, {
        id: resetId,
        userId: target.userId,
        tokenHash,
        createdByUserId: req.auth!.userId,
      });
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'member.password_reset',
        entityType: 'team_member',
        entityId: memberId,
      });
    });

    return {
      resetId,
      token: rawToken,
      resetPath: `/reset-password/${rawToken}`,
    };
  }

  @Put('logo')
  @UseGuards(TeamLeadGuard)
  async uploadLogo(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { fileName?: string; base64?: string },
  ) {
    if (!body?.base64 || typeof body.base64 !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_PAYLOAD',
        message: 'base64 image payload is required',
      });
    }

    const bytes = Buffer.from(body.base64, 'base64');
    const sniffed = sniffLogoImage(bytes);
    const sha256 = sha256Hex(bytes);
    const assetId = uuidv7();

    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      await upsertTeamLogo(conn, {
        assetId,
        teamId,
        fileName: (body.fileName || 'logo').slice(0, 255),
        mimeType: sniffed.mimeType,
        bytes,
        sha256,
        width: sniffed.width,
        height: sniffed.height,
        createdByUserId: req.auth!.userId,
      });
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'team.settings_updated',
        entityType: 'team_asset',
        entityId: assetId,
        metadata: { kind: 'logo', mimeType: sniffed.mimeType },
      });
    });

    return { ok: true, mimeType: sniffed.mimeType };
  }

  @Get('logo')
  async getLogo(@Param('teamId') teamId: string, @Res() res: Response) {
    const pool = getPool()!;
    const logo = await findTeamLogo(pool, teamId);
    if (!logo) {
      throw new NotFoundException({ code: 'LOGO_NOT_FOUND', message: 'No team logo uploaded' });
    }
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(logo.bytes);
  }
}
