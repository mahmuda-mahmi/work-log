import { z } from 'zod';

export const MemberRoleSchema = z.enum(['lead', 'member']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const ReportStatusSchema = z.enum(['draft', 'finalized', 'reopened']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const NumberingModeSchema = z.enum(['numbered', 'plain']);
export type NumberingMode = z.infer<typeof NumberingModeSchema>;

export const TitleScopeSchema = z.enum(['daily', 'followup']);
export type TitleScope = z.infer<typeof TitleScopeSchema>;

export const FollowupStatusSchema = z.enum(['open', 'in_progress', 'done', 'archived']);
export type FollowupStatus = z.infer<typeof FollowupStatusSchema>;

export const ExportFormatSchema = z.enum(['docx', 'pdf']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const DictionaryTitleSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  isActive: z.boolean(),
  scope: TitleScopeSchema.default('daily'),
});
export type DictionaryTitle = z.infer<typeof DictionaryTitleSchema>;

export const DictionaryCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  isActive: z.boolean(),
  titles: z.array(DictionaryTitleSchema),
});
export type DictionaryCategory = z.infer<typeof DictionaryCategorySchema>;

export const RenameDictionarySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  scope: TitleScopeSchema.optional(),
});
export type RenameDictionaryInput = z.infer<typeof RenameDictionarySchema>;

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const CreateTitleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: TitleScopeSchema.optional(),
});
export type CreateTitleInput = z.infer<typeof CreateTitleSchema>;

export const CreateEntrySchema = z.object({
  categoryName: z.string().trim().min(1).max(80),
  titleName: z.string().trim().min(1).max(120),
  statusLines: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  completedByMemberIds: z.array(z.string().uuid()).max(10).default([]),
  completedByLabel: z.string().trim().min(1).max(80).nullable().optional(),
});
export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;

export const UpdateEntrySchema = z.object({
  statusText: z.string().trim().min(1).max(4000),
  completedByMemberId: z.string().uuid().nullable(),
  completedByLabel: z.string().trim().min(1).max(80).nullable(),
  version: z.number().int().min(1),
});
export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>;

export const ReorderIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderIdsInput = z.infer<typeof ReorderIdsSchema>;

export const UpdateGroupNumberingSchema = z.object({
  numberingMode: NumberingModeSchema,
});
export type UpdateGroupNumberingInput = z.infer<typeof UpdateGroupNumberingSchema>;

export const UpdateGroupSchema = z.object({
  categoryName: z.string().trim().min(1).max(80),
  titleName: z.string().trim().min(1).max(120),
});
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

export const WorkEntryDtoSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  statusText: z.string(),
  completedByMemberId: z.string().uuid().nullable(),
  completedByLabel: z.string().nullable(),
  completedByDisplay: z.string(),
  position: z.number().int(),
  version: z.number().int(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkEntryDto = z.infer<typeof WorkEntryDtoSchema>;

export const WorkGroupDtoSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  titleId: z.string().uuid(),
  titleName: z.string(),
  position: z.number().int(),
  numberingMode: NumberingModeSchema,
  entries: z.array(WorkEntryDtoSchema),
});
export type WorkGroupDto = z.infer<typeof WorkGroupDtoSchema>;

export const ReportFollowupDtoSchema = z.object({
  id: z.string().uuid(),
  categoryName: z.string(),
  titleName: z.string(),
  statusText: z.string(),
  completedByDisplay: z.string(),
  status: FollowupStatusSchema.optional(),
});
export type ReportFollowupDto = z.infer<typeof ReportFollowupDtoSchema>;

export const DailyReportDtoSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  reportDate: z.string(),
  todayDate: z.string(),
  status: ReportStatusSchema,
  preparedByName: z.string(),
  revision: z.number().int(),
  version: z.number().int(),
  etag: z.string(),
  groups: z.array(WorkGroupDtoSchema),
  followups: z.array(ReportFollowupDtoSchema),
});
export type DailyReportDto = z.infer<typeof DailyReportDtoSchema>;

export const CreateFollowupSchema = z.object({
  categoryName: z.string().trim().max(80).optional().default(''),
  titleName: z.string().trim().min(1).max(120),
  statusText: z.string().trim().min(1).max(4000),
  completedByMemberId: z.string().uuid().nullable().optional().default(null),
  completedByLabel: z.string().trim().max(80).nullable().optional().default('As Previous'),
});
export type CreateFollowupInput = z.infer<typeof CreateFollowupSchema>;

export const MoveFollowupToDailySchema = z.object({
  statusText: z.string().trim().min(1).max(4000).optional(),
});
export type MoveFollowupToDailyInput = z.infer<typeof MoveFollowupToDailySchema>;

export const UpdateFollowupSchema = z.object({
  categoryName: z.string().trim().max(80).optional(),
  titleName: z.string().trim().min(1).max(120).optional(),
  status: FollowupStatusSchema.optional(),
  statusText: z.string().trim().min(1).max(4000).optional(),
  completedByMemberId: z.string().uuid().nullable().optional(),
  completedByLabel: z.string().trim().min(1).max(80).nullable().optional(),
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  version: z.number().int().min(1),
});
export type UpdateFollowupInput = z.infer<typeof UpdateFollowupSchema>;

export const FollowupItemDtoSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string(),
  titleId: z.string().uuid().nullable(),
  titleName: z.string(),
  status: FollowupStatusSchema,
  statusText: z.string(),
  completedByMemberId: z.string().uuid().nullable(),
  completedByLabel: z.string().nullable(),
  completedByDisplay: z.string(),
  completedOn: z.string().nullable(),
  position: z.number().int(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FollowupItemDto = z.infer<typeof FollowupItemDtoSchema>;

export const FinalizeReportSchema = z.object({
  preparedByName: z.string().trim().min(1).max(120).optional(),
});
export type FinalizeReportInput = z.infer<typeof FinalizeReportSchema>;

export const ReportHistoryItemSchema = z.object({
  id: z.string().uuid(),
  reportDate: z.string(),
  status: ReportStatusSchema,
  revision: z.number().int(),
  preparedByName: z.string(),
  entryCount: z.number().int(),
  exportCount: z.number().int(),
  finalizedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type ReportHistoryItem = z.infer<typeof ReportHistoryItemSchema>;

export const ReportExportInfoSchema = z.object({
  id: z.string().uuid(),
  format: ExportFormatSchema,
  fileName: z.string(),
  byteSize: z.number().int(),
  downloadCount: z.number().int(),
  createdAt: z.string(),
});
export type ReportExportInfo = z.infer<typeof ReportExportInfoSchema>;
