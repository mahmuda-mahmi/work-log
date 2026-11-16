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
  MoveFollowupToDailySchema,
  ReorderIdsSchema,
  UpdateFollowupSchema,
  type CreateFollowupInput,
  type MoveFollowupToDailyInput,
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
import { ensureDefaultFollowups } from '../../domain/defaults.js';
import { getTeamTodayDate } from '../../domain/timezone.js';
import {
  bumpDailyReportVersion,
  findOrCreateWorkGroup,
  findReportForUpdate,
  getNextEntryPosition,
  insertIgnoreDailyReport,
  insertWorkEntry,
} from '../../db/repositories/reports.repo.js';
import { findTeamSettings } from '../../db/repositories/teams.repo.js';

@Controller('teams/:teamId/followups')
@UseGuards(SessionGuard, TeamScopeGuard)
export class FollowupsController {
  @Get()
  async list(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const pool = getPool()!;
    await ensureDefaultFollowups(pool, teamId, req.auth!.userId);
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

      const nextCatName =
        body.categoryName !== undefined ? body.categoryName.trim() : existing.categoryName;
      const nextTitleName =
        body.titleName !== undefined ? body.titleName.trim() : existing.titleName;

      let nextCategoryId = existing.categoryId;
      let nextTitleId = existing.titleId;
      if (body.categoryName !== undefined || body.titleName !== undefined) {
        const resolved = await findOrCreateCategoryAndTitle(
          conn,
          teamId,
          nextCatName || 'General',
          nextTitleName,
        );
        nextCategoryId = nextCatName ? resolved.categoryId : null;
        nextTitleId = resolved.titleId;
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
        categoryId: nextCategoryId,
        titleId: nextTitleId,
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

  @Post(':followupId/move-to-daily')
  async moveToDaily(
    @Param('teamId') teamId: string,
    @Param('followupId') followupId: string,
    @Body(new ZodValidationPipe(MoveFollowupToDailySchema)) body: MoveFollowupToDailyInput,
    @Req() req: AuthenticatedRequest,
  ) {
    const auth = req.auth!;
    const pool = getPool()!;
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    return withTransaction(pool, async (conn) => {
      const existing = await findFollowupById(conn, teamId, followupId);
      if (!existing) {
        throw new NotFoundException({
          code: 'FOLLOWUP_NOT_FOUND',
          message: 'Follow-up not found',
        });
      }

      let report = await findReportForUpdate(conn, teamId, todayDate);
      if (!report) {
        const settings = await findTeamSettings(conn, teamId);
        const preparedBy = settings?.preparedByDefault?.trim() || auth.displayName;
        await insertIgnoreDailyReport(conn, {
          id: uuidv7(),
          teamId,
          reportDate: todayDate,
          preparedByName: preparedBy,
          preparedByUserId: auth.userId,
        });
        report = await findReportForUpdate(conn, teamId, todayDate);
      }

      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({
          code: 'REPORT_FINALIZED',
          message: "Today's report is finalized; reopen it before moving follow-ups",
        });
      }

      const catName = existing.categoryName?.trim() || 'General';
      const { categoryId, titleId } = await findOrCreateCategoryAndTitle(
        conn,
        teamId,
        catName,
        existing.titleName,
      );

      const groupId = await findOrCreateWorkGroup(conn, {
        groupId: uuidv7(),
        reportId: report.id,
        categoryId,
        titleId,
        numberingMode: catName.toLowerCase() === 'support' ? 'numbered' : 'plain',
        createdByUserId: auth.userId,
      });

      const pos = await getNextEntryPosition(conn, groupId);
      const entryId = uuidv7();
      const nextStatusText = body.statusText?.trim() || existing.statusText;
      const nextLabel = existing.completedByMemberId
        ? null
        : existing.completedByLabel && existing.completedByLabel !== 'As Previous'
          ? existing.completedByLabel
          : null;

      await insertWorkEntry(conn, {
        id: entryId,
        groupId,
        statusText: nextStatusText,
        completedByMemberId: existing.completedByMemberId,
        completedByLabel: nextLabel,
        position: pos,
        createdByUserId: auth.userId,
      });

      await bumpDailyReportVersion(conn, report.id);
      await archiveFollowupItem(conn, teamId, followupId, auth.userId);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'followup.moved_to_daily',
        entityType: 'followup_item',
        entityId: followupId,
        metadata: { reportDate: todayDate, entryId },
      });

      return { ok: true, reportDate: todayDate, entryId };
    });
  }
}
