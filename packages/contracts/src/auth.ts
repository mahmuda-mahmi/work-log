import { z } from 'zod';
import { MemberRoleSchema } from './reports.js';

export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
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
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const AuthSessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  }),
  team: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    documentTitle: z.string(),
    filePrefix: z.string(),
    preparedByDefault: z.string().nullable(),
    hasLogo: z.boolean(),
  }),
  member: z.object({
    id: z.string().uuid(),
    role: MemberRoleSchema,
    displayName: z.string(),
  }),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;
