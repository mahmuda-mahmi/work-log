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
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  CreateEntrySchema,
  ExportFormatSchema,
  FinalizeReportSchema,
  ReorderIdsSchema,
  UpdateEntrySchema,
  UpdateGroupNumberingSchema,
  UpdateGroupSchema,
  type CreateEntryInput,
  type ExportFormat,
  type FinalizeReportInput,
  type ReorderIdsInput,
  type UpdateEntryInput,
  type UpdateGroupInput,
  type UpdateGroupNumberingInput,
} from '@cghq/contracts';
import type { ReportEntryInput } from '@cghq/document';
import { get as blobGet, put as blobPut } from '@vercel/blob';
import type { Response } from 'express';
import {
  type AuthenticatedRequest,
  SessionGuard,
  TeamLeadGuard,
  TeamScopeGuard,
} from '../../common/auth.guard.js';
import { sha256Hex } from '../../common/crypto.js';
import { uuidv7 } from '../../common/uuid.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { getPool, withTransaction } from '../../db/pool.js';
import { appendAuditEvent } from '../../db/repositories/audit.repo.js';
import { findOrCreateCategoryAndTitle, listDictionary } from '../../db/repositories/dictionary.repo.js';
import {
  deleteFrozenFollowups,
  finalizeDailyReportRow,
  findExportBySnapshotAndFormat,
  findLatestSnapshotForReport,
  incrementExportDownloadCount,
  insertFrozenFollowup,
  insertReportExport,
  insertReportSnapshot,
  listExportsForReport,
  listReportHistory,
  reopenDailyReportRow,
} from '../../db/repositories/exports.repo.js';
import { listTeamFollowups } from '../../db/repositories/followups.repo.js';
import {
  assembleDailyReportDto,
  bumpDailyReportVersion,
  deleteDailyReport,
  deleteWorkGroup,
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
  updateWorkGroupCategoryTitle,
  updateWorkGroupNumbering,
  updateWorkGroupPosition,
} from '../../db/repositories/reports.repo.js';
import { findTeamSettings, listTeamMembers } from '../../db/repositories/teams.repo.js';
import {
  ensureDefaultDictionary,
  ensureDefaultFollowups,
  ensureDefaultReportGroups,
} from '../../domain/defaults.js';
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

  @Get('workspace')
  async getTodayWorkspace(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const todayDate = getTeamTodayDate(req.auth!.teamTimezone);
    return this.loadWorkspaceBundle(teamId, todayDate, req);
  }

  @Get('workspace/:date')
  async getWorkspaceByDate(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const reportDate =
      dateParam === 'today'
        ? getTeamTodayDate(req.auth!.teamTimezone)
        : assertValidIsoDate(dateParam);
    return this.loadWorkspaceBundle(teamId, reportDate, req);
  }

  @Get('history')
  async getHistory(@Param('teamId') teamId: string) {
    const pool = getPool()!;
    return listReportHistory(pool, teamId);
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

  private async loadWorkspaceBundle(
    teamId: string,
    reportDate: string,
    req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const [report, dictionary, members] = await Promise.all([
      this.loadReportDto(pool, teamId, reportDate, req),
      ensureDefaultDictionary(pool, teamId).then(() => listDictionary(pool, teamId)),
      listTeamMembers(pool, teamId),
    ]);
    return { report, dictionary, members };
  }

  private async loadReportDto(
    pool: NonNullable<ReturnType<typeof getPool>>,
    teamId: string,
    reportDate: string,
    req: AuthenticatedRequest,
  ) {
    const auth = req.auth!;
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    const [, existingReport] = await Promise.all([
      ensureDefaultFollowups(pool, teamId, auth.userId),
      findReportByDate(pool, teamId, reportDate),
    ]);
    let report = existingReport;
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

    if (report && report.status !== 'finalized') {
      await ensureDefaultReportGroups(pool, teamId, report.id, auth.userId);
    }

    if (!report) {
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
    }

    return assembleDailyReportDto(pool, report, todayDate);
  }

  private async serveReportByDate(
    teamId: string,
    reportDate: string,
    req: AuthenticatedRequest,
    res: Response,
  ) {
    const pool = getPool()!;
    const dto = await this.loadReportDto(pool, teamId, reportDate, req);
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
        numberingMode: body.categoryName.trim().toLowerCase() === 'support' ? 'numbered' : 'plain',
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

      await Promise.all([
        bumpDailyReportVersion(conn, report.id),
        appendAuditEvent(conn, {
          teamId,
          actorUserId: auth.userId,
          action: 'entry.created',
          entityType: 'work_entry',
          entityId: createdIds[0] ?? null,
          metadata: { reportDate, count: createdIds.length },
        }),
      ]);
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

  @Patch(':date/groups/:groupId')
  async updateGroup(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(UpdateGroupSchema)) body: UpdateGroupInput,
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

      const { categoryId, titleId } = await findOrCreateCategoryAndTitle(
        conn,
        teamId,
        body.categoryName,
        body.titleName,
      );
      const res = await updateWorkGroupCategoryTitle(
        conn,
        report.id,
        groupId,
        categoryId,
        titleId,
      );
      if (res.duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_GROUP',
          message: 'That Report Category and Title already exists in this report',
        });
      }
      if (!res.ok) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
      }
      await bumpDailyReportVersion(conn, report.id);
    });

    return { ok: true };
  }

  @Delete(':date/groups/:groupId')
  async removeGroup(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Param('groupId') groupId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const reportDate = assertValidIsoDate(dateParam);

    await withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({ code: 'REPORT_FINALIZED', message: 'Report is finalized' });
      }

      const ok = await deleteWorkGroup(conn, report.id, groupId);
      if (!ok) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
      }
      await bumpDailyReportVersion(conn, report.id);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'group.deleted',
        entityType: 'work_group',
        entityId: groupId,
        metadata: { reportDate },
      });
    });

    return { ok: true };
  }

  @Delete(':date')
  @UseGuards(TeamLeadGuard)
  async removeReport(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const reportDate = assertValidIsoDate(dateParam);

    await withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }

      await deleteDailyReport(conn, teamId, report.id);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'report.deleted',
        entityType: 'daily_report',
        entityId: report.id,
        metadata: { reportDate },
      });
    });

    return { ok: true };
  }

  @Post(':date/finalize')
  @UseGuards(TeamLeadGuard)
  async finalizeReport(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Body(new ZodValidationPipe(FinalizeReportSchema)) body: FinalizeReportInput,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const reportDate = assertValidIsoDate(dateParam);
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    return withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status === 'finalized') {
        throw new ConflictException({
          code: 'ALREADY_FINALIZED',
          message: 'Report is already finalized',
        });
      }

      const preparedByName = body.preparedByName?.trim() || report.prepared_by_name;
      const ok = await finalizeDailyReportRow(conn, report.id, preparedByName, auth.userId);
      if (!ok) {
        throw new ConflictException({
          code: 'FINALIZE_FAILED',
          message: 'Could not finalize report',
        });
      }

      // Freeze active follow-ups (open / in_progress) into report_followups for this report (Q4)
      await deleteFrozenFollowups(conn, report.id);
      const liveFollowups = await listTeamFollowups(conn, teamId, false);
      const activeFollowups = liveFollowups.filter(
        (f) => f.status === 'open' || f.status === 'in_progress',
      );
      for (let i = 0; i < activeFollowups.length; i += 1) {
        const f = activeFollowups[i]!;
        await insertFrozenFollowup(conn, {
          id: uuidv7(),
          reportId: report.id,
          followupItemId: f.id,
          categoryName: f.categoryName,
          titleName: f.titleName,
          statusText: f.statusText,
          completedByText: f.completedByDisplay,
          position: (i + 1) * 1000,
        });
      }

      const finalizedReport = await findReportByDate(conn, teamId, reportDate);
      const dto = await assembleDailyReportDto(conn, finalizedReport!, todayDate);
      const payloadJson = JSON.stringify(dto);
      const contentHash = sha256Hex(payloadJson);

      await insertReportSnapshot(conn, {
        id: uuidv7(),
        reportId: report.id,
        revision: dto.revision,
        payloadJson,
        contentHash,
        actorUserId: auth.userId,
      });

      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'report.finalized',
        entityType: 'daily_report',
        entityId: report.id,
        metadata: { reportDate, revision: dto.revision },
      });

      return dto;
    });
  }

  @Post(':date/reopen')
  @UseGuards(TeamLeadGuard)
  async reopenReport(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const pool = getPool()!;
    const auth = req.auth!;
    const reportDate = assertValidIsoDate(dateParam);
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    return withTransaction(pool, async (conn) => {
      const report = await findReportForUpdate(conn, teamId, reportDate);
      if (!report) {
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
      }
      if (report.status !== 'finalized') {
        throw new ConflictException({
          code: 'NOT_FINALIZED',
          message: 'Only finalized reports can be reopened',
        });
      }

      await reopenDailyReportRow(conn, report.id);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: auth.userId,
        action: 'report.reopened',
        entityType: 'daily_report',
        entityId: report.id,
        metadata: { reportDate, revision: report.revision },
      });

      const reopened = await findReportByDate(conn, teamId, reportDate);
      return assembleDailyReportDto(conn, reopened!, todayDate);
    });
  }

  @Get(':date/exports')
  async listExports(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
  ) {
    const pool = getPool()!;
    const reportDate = assertValidIsoDate(dateParam);
    const report = await findReportByDate(pool, teamId, reportDate);
    if (!report) {
      return [];
    }
    return listExportsForReport(pool, report.id);
  }

  @Get(':date/export')
  async downloadExport(
    @Param('teamId') teamId: string,
    @Param('date') dateParam: string,
    @Query('format') formatRaw: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const parsedFormat = ExportFormatSchema.safeParse(formatRaw);
    if (!parsedFormat.success) {
      throw new BadRequestException({
        code: 'INVALID_EXPORT_FORMAT',
        message: 'format query parameter must be "pdf" or "docx"',
      });
    }
    const format: ExportFormat = parsedFormat.data;
    const pool = getPool()!;
    const auth = req.auth!;
    const reportDate = assertValidIsoDate(dateParam);
    const todayDate = getTeamTodayDate(auth.teamTimezone);

    const report = await findReportByDate(pool, teamId, reportDate);
    if (!report) {
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found' });
    }
    if (report.status !== 'finalized') {
      throw new ConflictException({
        code: 'REPORT_NOT_FINALIZED',
        message: 'Report must be finalized before exporting (Q7)',
      });
    }

    const snapshot = await findLatestSnapshotForReport(pool, report.id);
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: 'Finalized snapshot not found; reopen and finalize again',
      });
    }

    const {
      buildDocumentModel,
      buildExportFileName,
      getDefaultLogoBytes,
      renderDocx,
      renderPdf,
    } = await import('@cghq/document');
    const settings = await findTeamSettings(pool, teamId);
    const fileName = buildExportFileName({
      filePrefix: settings?.filePrefix,
      reportDate,
      format,
      revision: snapshot.revision,
    });

    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const existingExport = await findExportBySnapshotAndFormat(pool, snapshot.id, format);

    let fileBytes: Buffer | null = null;
    if (existingExport && hasBlobToken) {
      try {
        const blobResult = await blobGet(existingExport.storageKey, { access: 'private' });
        if (blobResult && blobResult.stream) {
          const arr = await new Response(blobResult.stream).arrayBuffer();
          fileBytes = Buffer.from(arr);
          await incrementExportDownloadCount(pool, existingExport.id);
        }
      } catch {
        // Fall through to deterministic re-render if Blob fetch fails
        fileBytes = null;
      }
    }

    if (!fileBytes) {
      const dto = await assembleDailyReportDto(pool, report, todayDate);
      const entries: ReportEntryInput[] = dto.groups
        .filter((g) => g.entries.length > 0)
        .flatMap((g) =>
          g.entries.map((e) => ({
            categoryName: g.categoryName,
            titleName: g.titleName,
            statusText: e.statusText,
            completedBy: e.completedByDisplay,
            numberingMode: g.numberingMode,
          })),
        );
      const model = buildDocumentModel({
        documentTitle: settings?.documentTitle,
        reportDate,
        preparedBy: dto.preparedByName,
        logoBytes: getDefaultLogoBytes(),
        entries,
        followups: dto.followups.map((f) => ({
          categoryName: f.categoryName,
          titleName: f.titleName,
          statusText: f.statusText,
          completedBy: f.completedByDisplay,
        })),
      });

      fileBytes = format === 'pdf' ? await renderPdf(model) : await renderDocx(model);

      if (!existingExport) {
        const storageKey = `teams/${teamId}/reports/${reportDate}/rev-${snapshot.revision}/${fileName}`;
        if (hasBlobToken) {
          await blobPut(storageKey, fileBytes, {
            access: 'private',
            contentType,
            addRandomSuffix: false,
          });
        }
        await insertReportExport(pool, {
          id: uuidv7(),
          reportId: report.id,
          snapshotId: snapshot.id,
          format,
          fileName,
          storageKey,
          byteSize: fileBytes.byteLength,
          sha256: sha256Hex(fileBytes),
          actorUserId: auth.userId,
        });
      } else {
        await incrementExportDownloadCount(pool, existingExport.id);
      }

      await appendAuditEvent(pool, {
        teamId,
        actorUserId: auth.userId,
        action: 'report.exported',
        entityType: 'daily_report',
        entityId: report.id,
        metadata: { format, revision: snapshot.revision, fileName },
      });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(fileBytes.byteLength));
    return res.send(fileBytes);
  }
}
