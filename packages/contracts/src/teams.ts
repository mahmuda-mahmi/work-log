import { z } from 'zod';
import { EmailSchema } from './auth.js';
import { MemberRoleSchema } from './reports.js';

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
});
export type UpdateTeamSettingsInput = z.infer<typeof UpdateTeamSettingsSchema>;

export const CreateInviteSchema = z.object({
  email: EmailSchema.optional(),
  role: MemberRoleSchema.default('member'),
});
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const UpdateMemberRoleSchema = z.object({
  role: MemberRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

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
