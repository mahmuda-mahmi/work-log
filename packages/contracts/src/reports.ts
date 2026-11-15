import { z } from 'zod';

export const MemberRoleSchema = z.enum(['lead', 'member']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const ReportStatusSchema = z.enum(['draft', 'finalized', 'reopened']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const FollowupStatusSchema = z.enum(['open', 'in_progress', 'done', 'archived']);
export type FollowupStatus = z.infer<typeof FollowupStatusSchema>;

export const ExportFormatSchema = z.enum(['docx', 'pdf']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const CreateEntrySchema = z.object({
  categoryName: z.string().trim().min(1).max(80),
  titleName: z.string().trim().min(1).max(120),
  statusLines: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  completedByMemberIds: z.array(z.string().uuid()).min(1).max(10),
});

export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;

export const UpdateEntrySchema = z.object({
  statusText: z.string().trim().min(1).max(300),
  completedByMemberId: z.string().uuid().nullable(),
  completedByLabel: z.string().trim().min(1).max(80).nullable(),
  version: z.number().int().min(1),
});

export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>;
