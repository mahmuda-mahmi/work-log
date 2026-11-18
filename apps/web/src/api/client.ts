import type {
  AcceptInviteInput,
  AuthSession,
  BootstrapLeadInput,
  ChangePasswordInput,
  CompletePasswordResetInput,
  CreateEntryInput,
  CreateFollowupInput,
  CreateInviteInput,
  CreateTeamInput,
  DailyReportDto,
  DictionaryCategory,
  ExportFormat,
  FinalizeReportInput,
  FollowupItemDto,
  FrequentStatusDto,
  JoinByCodeInput,
  LoginInput,
  MemberSummary,
  RegisterInput,
  ReorderIdsInput,
  ReportExportInfo,
  ReportHistoryItem,
  SubmitJoinRequestInput,
  TeamJoinRequestDto,
  TeamSettings,
  UpdateEntryInput,
  UpdateFollowupInput,
  UpdateGroupInput,
  UpdateGroupNumberingInput,
  UpdateMemberProfileInput,
  UpdateTeamSettingsInput,
  UserTeamSummary,
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
    if (
      res.status === 401 &&
      path !== '/api/auth/me' &&
      path !== '/api/auth/login' &&
      path !== '/api/auth/change-password' &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/invite/') &&
      !window.location.pathname.startsWith('/join/') &&
      !window.location.pathname.startsWith('/reset-password/')
    ) {
      try {
        window.localStorage.removeItem('cghq:session');
      } catch {
        // Ignore
      }
      window.location.replace('/login');
    }
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
  bootstrapStatus: () =>
    apiFetch<{ needsBootstrap: boolean; googleEnabled?: boolean }>('/api/auth/bootstrap-status'),
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
  register: (body: RegisterInput) =>
    apiFetch<{ ok: boolean }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createTeam: (body: CreateTeamInput) =>
    apiFetch<{ ok: boolean; teamId: string }>('/api/auth/teams', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  joinByCode: (body: JoinByCodeInput) =>
    apiFetch<{ ok: boolean; teamName: string }>('/api/auth/join-by-code', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch<AuthSession>('/api/auth/me'),
  updateAvatar: (avatarUrl: string | null) =>
    apiFetch<{ avatarUrl: string | null }>('/api/auth/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl }),
    }),
  listMyTeams: () => apiFetch<UserTeamSummary[]>('/api/auth/teams'),
  switchTeam: (teamId: string) =>
    apiFetch<{ ok: boolean; teamId: string }>(`/api/auth/teams/${teamId}/switch`, {
      method: 'POST',
    }),
  acceptInvite: (body: AcceptInviteInput) =>
    apiFetch<{ ok: boolean; teamId: string }>('/api/auth/invites/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitJoinRequest: (body: SubmitJoinRequestInput) =>
    apiFetch<{ ok: boolean; status: string; teamName: string }>('/api/auth/join-requests', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeReset: (body: CompletePasswordResetInput) =>
    apiFetch<{ ok: boolean }>('/api/auth/password-resets/complete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  changePassword: (body: ChangePasswordInput) =>
    apiFetch<{ ok: boolean }>('/api/auth/change-password', {
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
  updateProfile: (teamId: string, body: UpdateMemberProfileInput) =>
    apiFetch<{ displayName: string }>(`/api/teams/${teamId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  listMembers: (teamId: string) => apiFetch<MemberSummary[]>(`/api/teams/${teamId}/members`),
  createInvite: (teamId: string, body: CreateInviteInput) =>
    apiFetch<{ inviteId: string; token: string; invitePath: string; role: string }>(
      `/api/teams/${teamId}/invites`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  createJoinLink: (teamId: string) =>
    apiFetch<{ inviteId: string; token: string; joinPath: string }>(
      `/api/teams/${teamId}/join-link`,
      { method: 'POST' },
    ),
  listJoinRequests: (teamId: string) =>
    apiFetch<TeamJoinRequestDto[]>(`/api/teams/${teamId}/join-requests`),
  approveJoinRequest: (teamId: string, requestId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {
      method: 'POST',
    }),
  rejectJoinRequest: (teamId: string, requestId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {
      method: 'POST',
    }),
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
  leaveTeam: (teamId: string, newLeadMemberId?: string) =>
    apiFetch<{ ok: boolean; nextTeamId: string | null; remainingCount: number }>(
      `/api/teams/${teamId}/leave`,
      {
        method: 'POST',
        body: JSON.stringify(newLeadMemberId ? { newLeadMemberId } : {}),
      },
    ),
};

export const frequentStatusesApi = {
  list: (teamId: string) =>
    apiFetch<FrequentStatusDto[]>(`/api/teams/${teamId}/frequent-statuses`),
  create: (teamId: string, statusText: string, titleIds: string[] = []) =>
    apiFetch<FrequentStatusDto>(`/api/teams/${teamId}/frequent-statuses`, {
      method: 'POST',
      body: JSON.stringify({ statusText, titleIds }),
    }),
  update: (teamId: string, id: string, statusText: string, titleIds?: string[]) =>
    apiFetch<FrequentStatusDto>(`/api/teams/${teamId}/frequent-statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statusText, titleIds }),
    }),
  remove: (teamId: string, id: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/frequent-statuses/${id}`, {
      method: 'DELETE',
    }),
};

export const dictionaryApi = {
  list: (teamId: string) => apiFetch<DictionaryCategory[]>(`/api/teams/${teamId}/dictionary`),
  createCategory: (teamId: string, name: string) =>
    apiFetch<{ id: string; name: string }>(`/api/teams/${teamId}/dictionary/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  createTitle: (
    teamId: string,
    categoryId: string,
    name: string,
    scope: 'daily' | 'followup' = 'daily',
  ) =>
    apiFetch<{ id: string; name: string }>(
      `/api/teams/${teamId}/dictionary/categories/${categoryId}/titles`,
      {
        method: 'POST',
        body: JSON.stringify({ name, scope }),
      },
    ),
  updateCategory: (
    teamId: string,
    categoryId: string,
    body: { name?: string; isActive?: boolean },
  ) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/dictionary/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateTitle: (
    teamId: string,
    titleId: string,
    body: { name?: string; isActive?: boolean; scope?: 'daily' | 'followup' },
  ) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/dictionary/titles/${titleId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCategory: (teamId: string, categoryId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/dictionary/categories/${categoryId}`, {
      method: 'DELETE',
    }),
  deleteTitle: (teamId: string, titleId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/dictionary/titles/${titleId}`, {
      method: 'DELETE',
    }),
};

export const reportsApi = {
  getWorkspace: (teamId: string, date: string) =>
    apiFetch<{
      report: DailyReportDto;
      dictionary: DictionaryCategory[];
      members: MemberSummary[];
    }>(
      date === 'today'
        ? `/api/teams/${teamId}/reports/workspace`
        : `/api/teams/${teamId}/reports/workspace/${date}`,
    ),
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
  moveEntryToFollowup: (teamId: string, date: string, entryId: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/teams/${teamId}/reports/${date}/entries/${entryId}/move-to-followup`,
      { method: 'POST' },
    ),
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
  updateGroup: (teamId: string, date: string, groupId: string, body: UpdateGroupInput) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/reports/${date}/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteGroup: (teamId: string, date: string, groupId: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/reports/${date}/groups/${groupId}`, {
      method: 'DELETE',
    }),
  deleteReport: (teamId: string, date: string) =>
    apiFetch<{ ok: boolean }>(`/api/teams/${teamId}/reports/${date}`, {
      method: 'DELETE',
    }),
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
  removeAll: (teamId: string) =>
    apiFetch<{ ok: boolean; removedCount: number }>(`/api/teams/${teamId}/followups`, {
      method: 'DELETE',
    }),
  moveToDaily: (teamId: string, followupId: string, statusText?: string) =>
    apiFetch<{ ok: boolean; reportDate: string; entryId: string }>(
      `/api/teams/${teamId}/followups/${followupId}/move-to-daily`,
      {
        method: 'POST',
        body: JSON.stringify(statusText ? { statusText } : {}),
      },
    ),
};
