import {
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateFollowupSchema,
  ReorderIdsSchema,
  UpdateFollowupSchema,
  type CreateFollowupInput,
  type ReorderIdsInput,
  type UpdateFollowupInput,
} from '@cghq/contracts';
import {
  type AuthenticatedRequest,
  SessionGuard,
  TeamScopeGuard,
} from '../../common/auth.guard.js';
import { uuidv7 } from '../../common/uuid.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { getPool, withTransaction } from '../../db/pool.js';
import { appendAuditEvent } from '../../db/repositories/audit.repo.js';
import { findOrCreateCategoryAndTitle } from '../../db/repositories/dictionary.repo.js';
import {
  archiveFollowupItem,
  findFollowupById,
  getNextFollowupPosition,
  insertFollowupItem,
  listTeamFollowups,
  updateFollowupItemOptimistic,
  updateFollowupPosition,
} from '../../db/repositories/followups.repo.js';

@Controller('teams/:teamId/followups')
@UseGuards(SessionGuard, TeamScopeGuard)
export class FollowupsController {
  @Get()
  async list(
    @Param('teamId') teamId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const pool = getPool()!;
    return listTeamFollowups(pool, teamId, includeArchived === 'true');
  }

  @Post()
  async create(
    @Param('teamId') teamId: string,
    @Body(new ZodValidationPipe(CreateFollowupSchema)) body: CreateFollowupInput,
    @Req() req: AuthenticatedRequest,
  ) {
    const auth = req.auth!;
    const pool = getPool()!;
    const followupId = uuidv7();

    return withTransaction(pool, async (conn) => {
      const catName = body.categoryName?.trim() || 'General';
      const { categoryId, titleId } = await findOrCreateCategoryAndTitle(
        conn,
        teamId,
        catName,
        body.titleName,
      );
      const position = await getNextFollowupPosition(conn, teamId);
      const completedByMemberId = body.completedByMemberId ?? null;
      const completedByLabel = completedByMemberId
        ? null
        : body.completedByLabel?.trim() || 'As Previous';

      await insertFollowupItem(conn, {
        id: followupId,
        teamId,
        categoryId: body.categoryName?.trim() ? categoryId : null,
        titleId,
        statusText: body.statusText,
        completedByLabel,
        completedByMemberId,
        position,
        actorUserId: auth.userId,
      });

      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'followup.created',
        entityType: 'followup_item',
        entityId: followupId,
        metadata: { titleName: body.titleName },
      });

      return findFollowupById(conn, teamId, followupId);
    });
  }

  @Patch(':followupId')
  async update(
    @Param('teamId') teamId: string,
    @Param('followupId') followupId: string,
    @Body(new ZodValidationPipe(UpdateFollowupSchema)) body: UpdateFollowupInput,
    @Req() req: AuthenticatedRequest,
  ) {
    const auth = req.auth!;
    const pool = getPool()!;
    return withTransaction(pool, async (conn) => {
      const existing = await findFollowupById(conn, teamId, followupId);
      if (!existing) {
        throw new NotFoundException({ code: 'FOLLOWUP_NOT_FOUND', message: 'Follow-up not found' });
      }

      const nextStatus = body.status ?? existing.status;
      const nextText = body.statusText ?? existing.statusText;
      const nextMemberId =
        body.completedByMemberId !== undefined
          ? body.completedByMemberId
          : existing.completedByMemberId;
      const nextLabel =
        nextMemberId !== null
          ? null
          : body.completedByLabel !== undefined
            ? body.completedByLabel
            : (existing.completedByLabel ?? 'As Previous');
      const nextCompletedOn =
        body.completedOn !== undefined
          ? body.completedOn
          : nextStatus === 'done' && !existing.completedOn
            ? new Date().toISOString().slice(0, 10)
            : existing.completedOn;

      const updated = await updateFollowupItemOptimistic(conn, {
        teamId,
        followupId,
        status: nextStatus,
        statusText: nextText,
        completedByMemberId: nextMemberId,
        completedByLabel: nextLabel,
        completedOn: nextCompletedOn,
        actorUserId: auth.userId,
        expectedVersion: body.version,
      });

      if (!updated) {
        const current = await findFollowupById(conn, teamId, followupId);
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Follow-up item was modified by another user',
          current,
        });
      }

      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'followup.updated',
        entityType: 'followup_item',
        entityId: followupId,
        metadata: { status: nextStatus },
      });

      return findFollowupById(conn, teamId, followupId);
    });
  }

  @Put('reorder')
  async reorder(
    @Param('teamId') teamId: string,
    @Body(new ZodValidationPipe(ReorderIdsSchema)) body: ReorderIdsInput,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      for (let i = 0; i < body.ids.length; i += 1) {
        await updateFollowupPosition(conn, teamId, body.ids[i]!, (i + 1) * 1000);
      }
    });
    return listTeamFollowups(pool, teamId, false);
  }

  @Delete(':followupId')
  async archive(
    @Param('teamId') teamId: string,
    @Param('followupId') followupId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const auth = req.auth!;
    const pool = getPool()!;
    const ok = await withTransaction(pool, async (conn) => {
      const archived = await archiveFollowupItem(conn, teamId, followupId, auth.userId);
      if (archived) {
        await appendAuditEvent(conn, {
          teamId,
          actorUserId: auth.userId,
          action: 'followup.archived',
          entityType: 'followup_item',
          entityId: followupId,
          metadata: {},
        });
      }
      return archived;
    });
    if (!ok) {
      throw new NotFoundException({ code: 'FOLLOWUP_NOT_FOUND', message: 'Follow-up not found' });
    }
    return { ok: true };
  }
}
