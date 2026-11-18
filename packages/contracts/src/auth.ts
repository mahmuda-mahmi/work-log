import { z } from 'zod';
import { MemberRoleSchema } from './reports.js';

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Valid email address is required')
  .max(255);

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const BootstrapLeadSchema = z.object({
  teamName: z.string().trim().min(1).max(120),
  teamSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .min(2)
    .max(80),
  timezone: z.string().trim().min(1).max(64).default('Asia/Dhaka'),
  name: z.string().trim().min(1).max(120),
  email: EmailSchema,
  password: PasswordSchema,
});
export type BootstrapLeadInput = z.infer<typeof BootstrapLeadSchema>;

export const AcceptInviteSchema = z.object({
  token: z.string().trim().min(16).max(256),
  name: z.string().trim().min(1).max(120),
  email: EmailSchema,
  password: PasswordSchema,
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;

export const CompletePasswordResetSchema = z.object({
  token: z.string().trim().min(16).max(256),
  newPassword: PasswordSchema,
});
export type CompletePasswordResetInput = z.infer<typeof CompletePasswordResetSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional().default(''),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const AuthSessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().nullable().optional(),
    hasPassword: z.boolean().optional(),
    authMethod: z.enum(['password', 'google']).optional(),
  }),
  team: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      timezone: z.string(),
      documentTitle: z.string(),
      filePrefix: z.string(),
      preparedByDefault: z.string().nullable(),
      hasLogo: z.boolean(),
    })
    .nullable(),
  member: z
    .object({
      id: z.string().uuid(),
      role: MemberRoleSchema,
      displayName: z.string(),
    })
    .nullable(),
  pendingJoinTeamName: z.string().nullable().optional(),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export type ActiveAuthSession = AuthSession & {
  team: NonNullable<AuthSession['team']>;
  member: NonNullable<AuthSession['member']>;
};

export const UserTeamSummarySchema = z.object({
  teamId: z.string().uuid(),
  teamName: z.string(),
  teamSlug: z.string(),
  role: MemberRoleSchema,
  displayName: z.string(),
});
export type UserTeamSummary = z.infer<typeof UserTeamSummarySchema>;

export const UpdateAvatarSchema = z.object({
  avatarUrl: z.string().max(1_500_000).nullable(),
});
export type UpdateAvatarInput = z.infer<typeof UpdateAvatarSchema>;

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: EmailSchema,
  password: PasswordSchema,
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const CreateTeamSchema = z.object({
  teamName: z.string().trim().min(1, 'Team name is required').max(120),
  teamSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .min(2)
    .max(80)
    .optional(),
  timezone: z.string().trim().min(1).max(64).default('Asia/Dhaka'),
});
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;

export const JoinByCodeSchema = z.object({
  codeOrLink: z.string().trim().min(2, 'Enter a team code or join link').max(512),
});
export type JoinByCodeInput = z.infer<typeof JoinByCodeSchema>;

export const SubmitJoinRequestSchema = z.object({
  token: z.string().trim().min(16).max(256),
  name: z.string().trim().min(1).max(120),
  email: EmailSchema.optional(),
  password: PasswordSchema.optional(),
});
export type SubmitJoinRequestInput = z.infer<typeof SubmitJoinRequestSchema>;

export interface TeamJoinRequestDto {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
