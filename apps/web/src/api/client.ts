import type {
  AcceptInviteInput,
  AuthSession,
  BootstrapLeadInput,
  CompletePasswordResetInput,
  CreateInviteInput,
  LoginInput,
  MemberSummary,
  TeamSettings,
  UpdateTeamSettingsInput,
} from '@cghq/contracts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new ApiError(res.status, body.code ?? 'HTTP_ERROR', body.message ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export const authApi = {
  bootstrapStatus: () => apiFetch<{ needsBootstrap: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: BootstrapLeadInput) =>
    apiFetch<{ ok: boolean; teamId: string }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: LoginInput) =>
    apiFetch<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch<AuthSession>('/api/auth/me'),
  acceptInvite: (body: AcceptInviteInput) =>
    apiFetch<{ ok: boolean; teamId: string }>('/api/auth/invites/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeReset: (body: CompletePasswordResetInput) =>
    apiFetch<{ ok: boolean }>('/api/auth/password-resets/complete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const teamsApi = {
  getSettings: (teamId: string) => apiFetch<TeamSettings>(`/api/teams/${teamId}/settings`),
  updateSettings: (teamId: string, body: UpdateTeamSettingsInput) =>
    apiFetch<TeamSettings>(`/api/teams/${teamId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  listMembers: (teamId: string) => apiFetch<MemberSummary[]>(`/api/teams/${teamId}/members`),
  createInvite: (teamId: string, body: CreateInviteInput) =>
    apiFetch<{ inviteId: string; token: string; invitePath: string; role: string }>(
      `/api/teams/${teamId}/invites`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  changeRole: (teamId: string, memberId: string, role: 'lead' | 'member') =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  deactivateMember: (teamId: string, memberId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/members/${memberId}`, { method: 'DELETE' }),
  issuePasswordReset: (teamId: string, memberId: string) =>
    apiFetch<{ resetId: string; token: string; resetPath: string }>(
      `/api/teams/${teamId}/members/${memberId}/password-reset`,
      { method: 'POST' },
    ),
  uploadLogo: (teamId: string, fileName: string, base64: string) =>
    apiFetch<{ ok: boolean; mimeType: string }>(`/api/teams/${teamId}/logo`, {
      method: 'PUT',
      body: JSON.stringify({ fileName, base64 }),
    }),
};
