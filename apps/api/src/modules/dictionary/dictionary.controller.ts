import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateCategorySchema,
  CreateTitleSchema,
  RenameDictionarySchema,
  type CreateCategoryInput,
  type CreateTitleInput,
  type RenameDictionaryInput,
} from '@cghq/contracts';
import {
  type AuthenticatedRequest,
  SessionGuard,
  TeamLeadGuard,
  TeamScopeGuard,
} from '../../common/auth.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { getPool, withTransaction } from '../../db/pool.js';
import { appendAuditEvent } from '../../db/repositories/audit.repo.js';
import {
  createCategoryOnly,
  createTitleUnderCategory,
  listDictionary,
  updateCategory,
  updateTitle,
} from '../../db/repositories/dictionary.repo.js';
import { ensureDefaultDictionary } from '../../domain/defaults.js';

@Controller('teams/:teamId/dictionary')
@UseGuards(SessionGuard, TeamScopeGuard)
export class DictionaryController {
  @Get()
  async getDictionary(@Param('teamId') teamId: string) {
    const pool = getPool()!;
    await ensureDefaultDictionary(pool, teamId);
    return listDictionary(pool, teamId);
  }

  @Post('categories')
  @UseGuards(TeamLeadGuard)
  async createCategory(
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateCategorySchema)) body: CreateCategoryInput,
  ) {
    const pool = getPool()!;
    const created = await withTransaction(pool, async (conn) => {
      const cat = await createCategoryOnly(conn, teamId, body.name);
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'category.created',
        entityType: 'category',
        entityId: cat.id,
        metadata: { name: cat.name },
      });
      return cat;
    });
    return created;
  }

  @Post('categories/:categoryId/titles')
  @UseGuards(TeamLeadGuard)
  async createTitle(
    @Param('teamId') teamId: string,
    @Param('categoryId') categoryId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateTitleSchema)) body: CreateTitleInput,
  ) {
    const pool = getPool()!;
    const created = await withTransaction(pool, async (conn) => {
      const title = await createTitleUnderCategory(conn, teamId, categoryId, body.name);
      if (!title) {
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
      }
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: 'title.created',
        entityType: 'title',
        entityId: title.id,
        metadata: { categoryId, name: title.name },
      });
      return title;
    });
    return created;
  }

  @Patch('categories/:categoryId')
  @UseGuards(TeamLeadGuard)
  async patchCategory(
    @Param('teamId') teamId: string,
    @Param('categoryId') categoryId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(RenameDictionarySchema)) body: RenameDictionaryInput,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      const ok = await updateCategory(conn, teamId, categoryId, body);
      if (!ok) {
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
      }
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: body.isActive === false ? 'category.archived' : 'category.renamed',
        entityType: 'category',
        entityId: categoryId,
        metadata: body as Record<string, unknown>,
      });
    });
    return { ok: true };
  }

  @Patch('titles/:titleId')
  @UseGuards(TeamLeadGuard)
  async patchTitle(
    @Param('teamId') teamId: string,
    @Param('titleId') titleId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(RenameDictionarySchema)) body: RenameDictionaryInput,
  ) {
    const pool = getPool()!;
    await withTransaction(pool, async (conn) => {
      const ok = await updateTitle(conn, teamId, titleId, body);
      if (!ok) {
        throw new NotFoundException({ code: 'TITLE_NOT_FOUND', message: 'Title not found' });
      }
      await appendAuditEvent(conn, {
        teamId,
        actorUserId: req.auth!.userId,
        action: body.isActive === false ? 'title.archived' : 'title.renamed',
        entityType: 'title',
        entityId: titleId,
        metadata: body as Record<string, unknown>,
      });
    });
    return { ok: true };
  }
}
