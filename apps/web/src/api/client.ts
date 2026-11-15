import type {
  AcceptInviteInput,
  AuthSession,
  BootstrapLeadInput,
  CompletePasswordResetInput,
  CreateEntryInput,
  CreateFollowupInput,
  CreateInviteInput,
  DailyReportDto,
  DictionaryCategory,
  ExportFormat,
  FinalizeReportInput,
  FollowupItemDto,
  LoginInput,
  MemberSummary,
  ReorderIdsInput,
  ReportExportInfo,
  ReportHistoryItem,
  TeamSettings,
  UpdateEntryInput,
  UpdateFollowupInput,
  UpdateGroupNumberingInput,
  UpdateTeamSettingsInput,
} from '@cghq/contracts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly payload?: Record<string, unknown>,
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
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      [key: string]: unknown;
    };
    throw new ApiError(
      res.status,
      body.code ?? 'HTTP_ERROR',
      body.message ?? `Request failed (${res.status})`,
      body,
    );
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

export const dictionaryApi = {
  list: (teamId: string) => apiFetch<DictionaryCategory[]>(`/api/teams/${teamId}/dictionary`),
  renameCategory: (teamId: string, categoryId: string, name: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/dictionary/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  renameTitle: (teamId: string, titleId: string, name: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/dictionary/titles/${titleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
};

export const reportsApi = {
  getToday: (teamId: string) => apiFetch<DailyReportDto>(`/api/teams/${teamId}/reports/today`),
  getByDate: (teamId: string, date: string) =>
    apiFetch<DailyReportDto>(`/api/teams/${teamId}/reports/${date}`),
  history: (teamId: string) =>
    apiFetch<ReportHistoryItem[]>(`/api/teams/${teamId}/reports/history`),
  createEntry: (teamId: string, date: string, body: CreateEntryInput) =>
    apiFetch<{ ok: boolean; createdIds: string[] }>(`/api/teams/${teamId}/reports/${date}/entries`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateEntry: (teamId: string, date: string, entryId: string, body: UpdateEntryInput) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/reports/${date}/entries/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteEntry: (teamId: string, date: string, entryId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/reports/${date}/entries/${entryId}`, {
      method: 'DELETE',
    }),
  reorderGroups: (teamId: string, date: string, body: ReorderIdsInput) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/reports/${date}/groups/reorder`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  reorderEntries: (teamId: string, date: string, groupId: string, body: ReorderIdsInput) =>
    apiFetch<{ ok: boolean }>(
      `/api/teams/${teamId}/reports/${date}/groups/${groupId}/entries/reorder`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  updateGroupNumbering: (
    teamId: string,
    date: string,
    groupId: string,
    body: UpdateGroupNumberingInput,
  ) =>
    apiFetch<{ ok: boolean }>(
      `/api/teams/${teamId}/reports/${date}/groups/${groupId}/numbering`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  finalize: (teamId: string, date: string, body: FinalizeReportInput = {}) =>
    apiFetch<DailyReportDto>(`/api/teams/${teamId}/reports/${date}/finalize`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reopen: (teamId: string, date: string) =>
    apiFetch<DailyReportDto>(`/api/teams/${teamId}/reports/${date}/reopen`, {
      method: 'POST',
    }),
  listExports: (teamId: string, date: string) =>
    apiFetch<ReportExportInfo[]>(`/api/teams/${teamId}/reports/${date}/exports`),
  getExportUrl: (teamId: string, date: string, format: ExportFormat) =>
    `/api/teams/${teamId}/reports/${date}/export?format=${format}`,
};

export const followupsApi = {
  list: (teamId: string, includeArchived = false) =>
    apiFetch<FollowupItemDto[]>(
      `/api/teams/${teamId}/followups${includeArchived ? '?includeArchived=true' : ''}`,
    ),
  create: (teamId: string, body: CreateFollowupInput) =>
    apiFetch<FollowupItemDto>(`/api/teams/${teamId}/followups`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (teamId: string, followupId: string, body: UpdateFollowupInput) =>
    apiFetch<FollowupItemDto>(`/api/teams/${teamId}/followups/${followupId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  reorder: (teamId: string, body: ReorderIdsInput) =>
    apiFetch<FollowupItemDto[]>(`/api/teams/${teamId}/followups/reorder`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  archive: (teamId: string, followupId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/followups/${followupId}`, {
      method: 'DELETE',
    }),
};
