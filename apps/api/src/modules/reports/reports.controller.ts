import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
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
  CreateEntrySchema,
  ReorderIdsSchema,
  UpdateEntrySchema,
  UpdateGroupNumberingSchema,
  type CreateEntryInput,
  type ReorderIdsInput,
  type UpdateEntryInput,
  type UpdateGroupNumberingInput,
} from '@cghq/contracts';
import type { Response } from 'express';
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
  assembleDailyReportDto,
  bumpDailyReportVersion,
  findOrCreateWorkGroup,
  findReportByDate,
  findReportForUpdate,
  findWorkEntryForEdit,
  getNextEntryPosition,
  insertIgnoreDailyReport,
  insertWorkEntry,
  softDeleteWorkEntry,
  updateWorkEntryOptimistic,
  updateWorkEntryPosition,
  updateWorkGroupNumbering,
  updateWorkGroupPosition,
} from '../../db/repositories/reports.repo.js';
import { findTeamSettings } from '../../db/repositories/teams.repo.js';
import {
  assertDateAllowedForCreate,
  assertValidIsoDate,
  getTeamTodayDate,
} from '../../domain/timezone.js';

@Controller('teams/:teamId/reports')
@UseGuards(SessionGuard, TeamScopeGuard)
export class ReportsController {
  @Get('today')
  async getToday(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const todayDate = getTeamTodayDate(req.auth!.teamTimezone);
    return this.serveReportByDate(teamId, todayDate, req, res);
  }

  @Get(':date')
  async getByDate(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const reportDate = assertValidIsoDate(dateParam);
    return this.serveReportByDate(teamId, reportDate, req, res);
  }

  private async serveReportByDate(
    teamId: string,
    reportDate: string,
    req: AuthenticatedRequest,
    res: Response,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    let report = await findReportByDate(pool, teamId, reportDate);
    if (!report) {
      assertDateAllowedForCreate(reportDate, todayDate, auth.role);
      const settings = await findTeamSettings(pool, teamId);
      const preparedBy = settings?.preparedByDefault?.trim() || auth.displayName;
      const newReportId = uuidv7();
      const inserted = await insertIgnoreDailyReport(pool, {
        id: newReportId,
        teamId,
        reportDate,
        preparedByName: preparedBy,
        preparedByUserId: auth.userId,
      });

      if (inserted) {
        await appendAuditEvent(pool, {
          teamId,
          actorUserId: auth.userId,
          action: reportDate < todayDate ? 'report.backfilled' : 'report.created',
          entityType: 'daily_report',
          entityId: newReportId,
          metadata: { reportDate },
        });
      }
      report = await findReportByDate(pool, teamId, reportDate);
    }

    if (!report) {
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
    }

    const dto = await assembleDailyReportDto(pool, report, todayDate);
    const ifNoneMatch = req.headers['if-none-match'];
    res.setHeader('ETag', dto.etag);
    res.setHeader('Cache-Control', 'no-cache');

    if (ifNoneMatch && ifNoneMatch === dto.etag) {
      res.status(HttpStatus.NOT_MODIFIED).send();
      return;
    }

    res.status(HttpStatus.OK).json(dto);
  }

  @Post(':date/entries')
  async createEntries(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateEntrySchema)) body: CreateEntryInput,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const reportDate = assertValidIsoDate(dateParam);
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    if (body.completedByMemberIds.length === 0 && !body.completedByLabel) {
      throw new BadRequestException({
        code: 'COMPLETED_BY_REQUIRED',
        message: 'Select at least one member or provide a label',
      });
    }

    const createdIds: string[] = [];

    await withTransaction(pool, async (conn) => {
      let report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        assertDateAllowedForCreate(reportDate, todayDate, auth.role);
        const settings = await findTeamSettings(conn, teamId);
        const preparedBy = settings?.preparedByDefault?.trim() || auth.displayName;
        await insertIgnoreDailyReport(conn, {
          id: uuidv7(),
          teamId,
          reportDate,
          preparedByName: preparedBy,
          preparedByUserId: auth.userId,
        });
        report = await findReportForUpdate(conn, teamId, reportDate);
      }

      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({
          code: 'REPORT_FINALIZED',
          message: 'Report was finalized; ask a Team Lead to reopen it before editing',
        });
      }

      const { categoryId, titleId } = await findOrCreateCategoryAndTitle(
        conn,
        teamId,
        body.categoryName,
        body.titleName,
      );

      const groupId = await findOrCreateWorkGroup(conn, {
        groupId: uuidv7(),
        reportId: report.id,
        categoryId,
        titleId,
        createdByUserId: auth.userId,
      });

      let pos = await getNextEntryPosition(conn, groupId);

      const assignees: Array<{ memberId: string | null; label: string | null }> =
        body.completedByMemberIds.length > 0
          ? body.completedByMemberIds.map((mId) => ({ memberId: mId, label: null }))
          : [{ memberId: null, label: body.completedByLabel ?? null }];

      for (const line of body.statusLines) {
        for (const assignee of assignees) {
          const entryId = uuidv7();
          await insertWorkEntry(conn, {
            id: entryId,
            groupId,
            statusText: line,
            completedByMemberId: assignee.memberId,
            completedByLabel: assignee.label,
            position: pos,
            createdByUserId: auth.userId,
          });
          pos += 10;
          createdIds.push(entryId);
        }
      }

      await bumpDailyReportVersion(conn, report.id);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'entry.created',
        entityType: 'work_entry',
        entityId: createdIds[0] ?? null,
        metadata: { reportDate, count: createdIds.length },
      });
    });

    return { ok: true, createdIds };
  }

  @Patch(':date/entries/:entryId')
  async updateEntry(
    @Param('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(UpdateEntrySchema)) body: UpdateEntryInput,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;

    if (body.completedByMemberId && body.completedByLabel) {
      throw new BadRequestException({
        code: 'INVALID_COMPLETED_BY',
        message: 'Specify either a member or a custom label, not both',
      });
    }

    await withTransaction(pool, async (conn) => {
      const found = await findWorkEntryForEdit(conn, entryId, teamId);
      if (!found) {
        throw new NotFoundException({ code: 'ENTRY_NOT_FOUND', message: 'Entry not found' });
      }
      if (found.reportStatus === 'finalized') {
        throw new ConflictException({
          code: 'REPORT_FINALIZED',
          message: 'Report was finalized and cannot be edited',
        });
      }
      if (auth.role !== 'lead' && found.entry.createdByUserId !== auth.userId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ENTRY_EDIT',
          message: 'You can only edit entries you created',
        });
      }

      const updated = await updateWorkEntryOptimistic(conn, {
        entryId,
        statusText: body.statusText,
        completedByMemberId: body.completedByMemberId,
        completedByLabel: body.completedByLabel,
        expectedVersion: body.version,
        updatedByUserId: auth.userId,
      });

      if (!updated) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'This entry was modified by someone else',
          current: found.entry,
        });
      }

      await bumpDailyReportVersion(conn, found.reportId);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'entry.updated',
        entityType: 'work_entry',
        entityId: entryId,
      });
    });

    return { ok: true };
  }

  @Delete(':date/entries/:entryId')
  async deleteEntry(
    @Param('teamId') teamId: string,
    @Param('entryId') entryId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;

    await withTransaction(pool, async (conn) => {
      const found = await findWorkEntryForEdit(conn, entryId, teamId);
      if (!found) {
        throw new NotFoundException({ code: 'ENTRY_NOT_FOUND', message: 'Entry not found' });
      }
      if (found.reportStatus === 'finalized') {
        throw new ConflictException({
          code: 'REPORT_FINALIZED',
          message: 'Report was finalized and cannot be edited',
        });
      }
      if (auth.role !== 'lead' && found.entry.createdByUserId !== auth.userId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ENTRY_DELETE',
          message: 'You can only delete entries you created',
        });
      }

      await softDeleteWorkEntry(conn, entryId, auth.userId);
      await bumpDailyReportVersion(conn, found.reportId);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'entry.deleted',
        entityType: 'work_entry',
        entityId: entryId,
      });
    });

    return { ok: true };
  }

  @Put(':date/groups/reorder')
  async reorderGroups(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(ReorderIdsSchema)) body: ReorderIdsInput,
  ) {
    const pool = getPool()!;
    const reportDate = assertValidIsoDate(dateParam);

    await withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({ code: 'REPORT_FINALIZED', message: 'Report is finalized' });
      }

      for (let i = 0; i < body.ids.length; i++) {
        await updateWorkGroupPosition(conn, report.id, body.ids[i]!, (i + 1) * 10);
      }
      await bumpDailyReportVersion(conn, report.id);
    });

    return { ok: true };
  }

  @Put(':date/groups/:groupId/entries/reorder')
  async reorderEntries(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(ReorderIdsSchema)) body: ReorderIdsInput,
  ) {
    const pool = getPool()!;
    const reportDate = assertValidIsoDate(dateParam);

    await withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({ code: 'REPORT_FINALIZED', message: 'Report is finalized' });
      }

      for (let i = 0; i < body.ids.length; i++) {
        await updateWorkEntryPosition(conn, groupId, body.ids[i]!, (i + 1) * 10);
      }
      await bumpDailyReportVersion(conn, report.id);
    });

    return { ok: true };
  }

  @Patch(':date/groups/:groupId/numbering')
  async setGroupNumbering(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(UpdateGroupNumberingSchema)) body: UpdateGroupNumberingInput,
  ) {
    const pool = getPool()!;
    const reportDate = assertValidIsoDate(dateParam);

    await withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({ code: 'REPORT_FINALIZED', message: 'Report is finalized' });
      }

      const ok = await updateWorkGroupNumbering(conn, teamId, report.id, groupId, body.numberingMode);
      if (!ok) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
      }
      await bumpDailyReportVersion(conn, report.id);
    });

    return { ok: true };
  }
}
