import { z } from 'zod';
import { EmailSchema } from './auth.js';
import { MemberRoleSchema } from './reports.js';

export const DocumentFontFamilySchema = z.enum(['Times New Roman']);
export type DocumentFontFamily = z.infer<typeof DocumentFontFamilySchema>;

export const TeamSettingsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z.string(),
  documentTitle: z.string().trim().min(1).max(160),
  filePrefix: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  preparedByDefault: z.string().trim().min(1).max(120).nullable(),
  membersCanAddDictionary: z.boolean(),
  followupsEnabled: z.boolean(),
  hasLogo: z.boolean(),
  documentFontFamily: DocumentFontFamilySchema.default('Times New Roman'),
  documentFontSizePt: z.number().int().min(14).max(14).default(14),
});
export type TeamSettings = z.infer<typeof TeamSettingsSchema>;

export const UpdateTeamSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  documentTitle: z.string().trim().min(1).max(160).optional(),
  filePrefix: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  preparedByDefault: z.string().trim().min(1).max(120).nullable().optional(),
  membersCanAddDictionary: z.boolean().optional(),
  followupsEnabled: z.boolean().optional(),
  documentFontFamily: DocumentFontFamilySchema.optional(),
  documentFontSizePt: z.number().int().min(14).max(14).optional(),
});
export type UpdateTeamSettingsInput = z.infer<typeof UpdateTeamSettingsSchema>;

export const LeaveTeamSchema = z.object({
  newLeadMemberId: z.string().uuid().optional(),
});
export type LeaveTeamInput = z.infer<typeof LeaveTeamSchema>;

export const CreateInviteSchema = z.object({
  email: EmailSchema.optional(),
  role: MemberRoleSchema.default('member'),
});
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const UpdateMemberRoleSchema = z.object({
  role: MemberRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

export const UpdateMemberProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});
export type UpdateMemberProfileInput = z.infer<typeof UpdateMemberProfileSchema>;

export const MemberSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: MemberRoleSchema,
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type MemberSummary = z.infer<typeof MemberSummarySchema>;
