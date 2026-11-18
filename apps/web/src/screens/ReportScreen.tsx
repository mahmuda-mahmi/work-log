import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isNilCommunicationStatus, sortCommunicationItems } from '@cghq/document/model';
import type {
  ActiveAuthSession,
  DailyReportDto,
  DictionaryCategory,
  MemberSummary,
  WorkEntryDto,
  WorkGroupDto,
} from '@cghq/contracts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calendar,
  Check,
  Download,
  Forward,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  ApiError,
  dictionaryApi,
  frequentStatusesApi,
  reportsApi,
  teamsApi,
} from '../api/client.js';
import { EntryComposer } from '../components/EntryComposer.js';
import { ReportPreview } from '../components/ReportPreview.js';
import { ReportPageSkeleton } from '../components/WorkspaceSkeleton.js';
import { Alert } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button, buttonVariants } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { ConfirmDialog, PromptDialog } from '../components/ui/confirm-dialog.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';
import { Textarea } from '../components/ui/textarea.js';
import { cn } from '../lib/utils.js';

interface ReportScreenProps {
  session: ActiveAuthSession;
}

interface EditingEntryState {
  entryId: string;
  statusText: string;
  completedByMemberId: string | null;
  completedByLabel: string | null;
  version: number;
  conflictCurrent: WorkEntryDto | null;
}

interface EditingGroupState {
  groupId: string;
  categoryName: string;
  titleName: string;
}

interface QuickAddState {
  groupId: string;
  categoryName: string;
  titleName: string;
  communicationType: string;
  statusText: string;
  completedByMemberIds: string[];
}

type ConfirmAction =
  | { type: 'delete-entry'; entryId: string }
  | { type: 'delete-group'; group: WorkGroupDto }
  | { type: 'delete-report'; reportDate: string }
  | null;

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  const [removed] = copy.splice(index, 1);
  copy.splice(target, 0, removed!);
  return copy;
}

function orderEntriesByMemberSequence(
  entries: WorkEntryDto[],
  memberOrder: string[],
): WorkEntryDto[] {
  const buckets = new Map<string, WorkEntryDto[]>();
  for (const entry of entries) {
    const key = entry.completedByMemberId ?? '__unassigned__';
    const list = buckets.get(key) ?? [];
    list.push(entry);
    buckets.set(key, list);
  }
  const result: WorkEntryDto[] = [];
  for (const memberId of memberOrder) {
    const list = buckets.get(memberId);
    if (list) {
      result.push(...list);
      buckets.delete(memberId);
    }
  }
  const unassigned = buckets.get('__unassigned__');
  buckets.delete('__unassigned__');
  for (const list of buckets.values()) {
    result.push(...list);
  }
  if (unassigned) {
    result.push(...unassigned);
  }
  return result;
}

interface WorkspaceBundle {
  report: DailyReportDto;
  dictionary: DictionaryCategory[];
  members: MemberSummary[];
}

function readCachedWorkspace(key: string): WorkspaceBundle | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as WorkspaceBundle) : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedWorkspace(key: string, value: WorkspaceBundle): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function ReportScreen({ session }: ReportScreenProps) {
  const { date: routeDate } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const teamId = session.team.id;
  const dateKey = routeDate ?? 'today';
  const workspaceCacheKey = `cghq:workspace:${teamId}:${dateKey}`;

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<EditingEntryState | null>(null);
  const [editingGroup, setEditingGroup] = useState<EditingGroupState | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [finalizePromptOpen, setFinalizePromptOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(`worklog:setupDismissed:${teamId}`) === '1';
    } catch {
      return false;
    }
  });
  const [setupPairs, setSetupPairs] = useState<
    Array<{ category: string; title: string; scope: 'daily' | 'followup' }>
  >([{ category: '', title: '', scope: 'daily' }]);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ['report', teamId, 'workspace', dateKey],
    queryFn: async () => {
      const data = await reportsApi.getWorkspace(teamId, dateKey);
      writeCachedWorkspace(workspaceCacheKey, data);
      queryClient.setQueryData(['dictionary', teamId], data.dictionary);
      queryClient.setQueryData(['members', teamId], data.members);
      return data;
    },
    placeholderData: () => readCachedWorkspace(workspaceCacheKey),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const dictionary = workspaceQuery.data?.dictionary ?? [];
  const members = workspaceQuery.data?.members ?? [];

  const settingsQuery = useQuery({
    queryKey: ['team-settings', teamId],
    queryFn: () => teamsApi.getSettings(teamId),
  });

  const activeCategories = useMemo(
    () =>
      dictionary
        .filter((c) => c.isActive)
        .map((c) => ({
          ...c,
          titles: c.titles.filter((t) => t.isActive),
        }))
        .filter((c) => c.titles.length > 0),
    [dictionary],
  );

  const { data: frequentStatuses = [] } = useQuery({
    queryKey: ['frequent-statuses', teamId],
    queryFn: () => frequentStatusesApi.list(teamId),
  });
  const [quickAddStatusFocused, setQuickAddStatusFocused] = useState(false);
  const [dragMember, setDragMember] = useState<{ groupId: string; memberId: string } | null>(null);
  const [dragOverMember, setDragOverMember] = useState<{
    groupId: string;
    memberId: string;
  } | null>(null);

  const report = workspaceQuery.data?.report;
  const activeDate = routeDate ?? report?.reportDate ?? '';
  const isFinalized = report?.status === 'finalized';
  const showNewDayBanner = Boolean(report && report.todayDate !== report.reportDate);

  function syncReportCache(updated?: DailyReportDto) {
    if (updated) {
      queryClient.setQueryData<WorkspaceBundle | undefined>(
        ['report', teamId, 'workspace', updated.reportDate],
        (prev) => (prev ? { ...prev, report: updated } : undefined),
      );
      if (!routeDate) {
        queryClient.setQueryData<WorkspaceBundle | undefined>(
          ['report', teamId, 'workspace', 'today'],
          (prev) => (prev ? { ...prev, report: updated } : undefined),
        );
      }
    }
    void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    void queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    void queryClient.invalidateQueries({ queryKey: ['report-history', teamId] });
  }

  const finalizeMutation = useMutation({
    mutationFn: (preparedByName?: string) =>
      reportsApi.finalize(teamId, activeDate, preparedByName ? { preparedByName } : {}),
    onSuccess: (updated) => {
      setActionError(null);
      setFinalizePromptOpen(false);
      syncReportCache(updated);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to finalize report');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => reportsApi.reopen(teamId, activeDate),
    onSuccess: (updated) => {
      setActionError(null);
      syncReportCache(updated);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reopen report');
    },
  });

  const promoteFollowupMutation = useMutation({
    mutationFn: (entryId: string) => reportsApi.moveEntryToFollowup(teamId, activeDate, entryId),
    onMutate: async (entryId: string) => {
      await queryClient.cancelQueries({ queryKey: ['report', teamId] });
      const previous = queryClient.getQueryData<WorkspaceBundle>([
        'report',
        teamId,
        'workspace',
        dateKey,
      ]);

      queryClient.setQueryData<WorkspaceBundle | undefined>(
        ['report', teamId, 'workspace', dateKey],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            report: {
              ...old.report,
              groups: old.report.groups.map((g) => ({
                ...g,
                entries: g.entries.filter((e) => e.id !== entryId),
              })),
            },
          };
        },
      );

      setActionError(null);
      setActionSuccess('Moved to Follow-ups.');
      return { previous };
    },
    onError: (err, _entryId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['report', teamId, 'workspace', dateKey], context.previous);
      }
      setActionSuccess(null);
      setActionError(err instanceof ApiError ? err.message : 'Failed to move to follow-up');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      syncReportCache();
    },
  });

  const quickAddMutation = useMutation({
    mutationFn: (payload: QuickAddState) => {
      const trimmedStatus = payload.statusText.trim();
      const isComm = payload.categoryName.trim().toLowerCase() === 'communication';
      const hasCommPrefix = /^(officer|sailor)\s*:/i.test(trimmedStatus);
      const formattedStatus =
        isComm && payload.communicationType && trimmedStatus && !hasCommPrefix
          ? `${payload.communicationType}: ${trimmedStatus}`
          : trimmedStatus;
      const effectiveMemberIds = isNilCommunicationStatus(formattedStatus)
        ? []
        : payload.completedByMemberIds;
      return reportsApi.createEntry(teamId, activeDate, {
        categoryName: payload.categoryName,
        titleName: payload.titleName,
        statusLines: formattedStatus ? [formattedStatus] : [],
        completedByMemberIds: effectiveMemberIds,
      });
    },
    onSuccess: () => {
      setActionError(null);
      setQuickAdd(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to add status');
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: (payload: EditingGroupState) =>
      reportsApi.updateGroup(teamId, activeDate, payload.groupId, {
        categoryName: payload.categoryName,
        titleName: payload.titleName,
      }),
    onSuccess: () => {
      setActionError(null);
      setEditingGroup(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update category/title');
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (payload: {
      entryId: string;
      statusText: string;
      completedByMemberId: string | null;
      completedByLabel: string | null;
      version: number;
    }) =>
      reportsApi.updateEntry(teamId, activeDate, payload.entryId, {
        statusText: payload.statusText.trim(),
        completedByMemberId: payload.completedByMemberId,
        completedByLabel: payload.completedByLabel,
        version: payload.version,
      }),
    onSuccess: () => {
      setActionError(null);
      setEditingEntry(null);
      syncReportCache();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        const current = (err.payload?.current as WorkEntryDto | undefined) ?? null;
        setEditingEntry((prev) => (prev ? { ...prev, conflictCurrent: current } : prev));
        return;
      }
      setActionError(err instanceof ApiError ? err.message : 'Failed to update entry');
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => reportsApi.deleteEntry(teamId, activeDate, entryId),
    onSuccess: () => {
      setActionError(null);
      setConfirmAction(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete entry');
    },
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: (ids: string[]) => reportsApi.reorderGroups(teamId, activeDate, { ids }),
    onSuccess: () => {
      setActionError(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reorder groups');
    },
  });

  const reorderEntriesMutation = useMutation({
    mutationFn: ({ groupId, ids }: { groupId: string; ids: string[] }) =>
      reportsApi.reorderEntries(teamId, activeDate, groupId, { ids }),
    onSuccess: () => {
      setActionError(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reorder entries');
    },
  });

  const toggleNumberingMutation = useMutation({
    mutationFn: ({
      groupId,
      numberingMode,
    }: {
      groupId: string;
      numberingMode: 'numbered' | 'plain';
    }) =>
      reportsApi.updateGroupNumbering(teamId, activeDate, groupId, { numberingMode }),
    onSuccess: () => {
      setActionError(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to change numbering');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => reportsApi.deleteGroup(teamId, activeDate, groupId),
    onSuccess: () => {
      setActionError(null);
      setConfirmAction(null);
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete row');
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: () => reportsApi.deleteReport(teamId, activeDate),
    onSuccess: () => {
      setActionError(null);
      setConfirmAction(null);
      void queryClient.invalidateQueries({ queryKey: ['report-history', teamId] });
      void queryClient.removeQueries({ queryKey: ['report', teamId, activeDate] });
      navigate('/history');
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete log');
    },
  });

  function startEditEntry(entry: WorkEntryDto) {
    setActionError(null);
    setEditingEntry({
      entryId: entry.id,
      statusText: entry.statusText,
      completedByMemberId: entry.completedByMemberId,
      completedByLabel: entry.completedByLabel,
      version: entry.version,
      conflictCurrent: null,
    });
  }

  function startEditGroup(group: WorkGroupDto) {
    setActionError(null);
    setEditingGroup({
      groupId: group.id,
      categoryName: group.categoryName,
      titleName: group.titleName,
    });
  }

  function canMutateEntry(entry: WorkEntryDto): boolean {
    if (isFinalized) return false;
    return (
      session.member.role === 'lead' ||
      entry.createdByUserId === null ||
      entry.createdByUserId === session.user.id
    );
  }

  if (workspaceQuery.isLoading && !report) {
    return <ReportPageSkeleton showSlowHint />;
  }

  if (workspaceQuery.isError || !report) {
    const err = workspaceQuery.error;
    return (
      <Card>
        <CardContent className="grid gap-3 p-6">
          <h2 className="text-base font-bold text-zinc-950">Unable to load report</h2>
          <Alert variant="destructive">
            {err instanceof ApiError ? err.message : 'Could not load report for this date.'}
          </Alert>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/today')}>
              Go to Today&apos;s Report
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeMembers = members.filter((m) => m.isActive);
  const statusBadgeVariant =
    report.status === 'finalized'
      ? 'dark'
      : report.status === 'reopened'
        ? 'warning'
        : 'default';

  const confirmDialogConfig = (() => {
    if (!confirmAction) return null;
    if (confirmAction.type === 'delete-entry') {
      return {
        title: 'Delete Work Entry',
        description: 'Remove this status entry from the daily report?',
        confirmLabel: 'Delete Entry',
        pending: deleteEntryMutation.isPending,
        onConfirm: () => deleteEntryMutation.mutate(confirmAction.entryId),
      };
    }
    if (confirmAction.type === 'delete-group') {
      const { group } = confirmAction;
      return {
        title: 'Delete Table Row',
        description:
          group.entries.length > 0
            ? `Delete "${group.categoryName} — ${group.titleName}" and its ${group.entries.length} status entry/entries?`
            : `Delete row "${group.categoryName} — ${group.titleName}"?`,
        confirmLabel: 'Delete Row',
        pending: deleteGroupMutation.isPending,
        onConfirm: () => deleteGroupMutation.mutate(group.id),
      };
    }
    return {
      title: `Delete Daily Log (${confirmAction.reportDate})`,
      description:
        'Permanently delete this entire daily report and all of its entries? This cannot be undone.',
      confirmLabel: 'Delete Log',
      pending: deleteReportMutation.isPending,
      onConfirm: () => deleteReportMutation.mutate(),
    };
  })();

  return (
    <div className="flex flex-col gap-3.5">
      {showNewDayBanner && (
        <Alert className="no-print flex flex-wrap items-center justify-between gap-3">
          <span>
            New day started in {session.team.timezone}: today is{' '}
            <strong>{report.todayDate}</strong> (you are viewing{' '}
            <strong>{report.reportDate}</strong>).
          </span>
          <Button type="button" variant="dark" size="sm" onClick={() => navigate('/today')}>
            Jump to Today
          </Button>
        </Alert>
      )}

      {/* Command Toolbar: every single control, badge, and input is strictly h-8 (32px) */}
      <Card className="no-print">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 items-center gap-2 text-xs font-semibold text-zinc-700">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              <span>Report Date</span>
              <Input
                type="date"
                className="h-8 w-auto px-2.5 text-xs font-medium"
                value={report.reportDate}
                max={report.todayDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!next) return;
                  if (next === report.todayDate) {
                    navigate('/today');
                  } else {
                    navigate(`/reports/${next}`);
                  }
                }}
              />
            </label>

            <Badge variant={statusBadgeVariant} size="toolbar" className="uppercase tracking-wide">
              {isFinalized ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              {report.status}
            </Badge>

            <Badge variant="secondary" size="toolbar" className="uppercase">
              REV {report.revision}
            </Badge>

            <Badge variant="outline" size="toolbar" className="text-zinc-600">
              <RefreshCw className="h-3 w-3" />
              Auto-sync 15s
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {session.member.role === 'lead' &&
              (isFinalized ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reopenMutation.isPending}
                  onClick={() => reopenMutation.mutate()}
                >
                  <Unlock className="h-3.5 w-3.5" />
                  {reopenMutation.isPending ? 'Reopening…' : 'Reopen'}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={finalizeMutation.isPending}
                  onClick={() => setFinalizePromptOpen(true)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {finalizeMutation.isPending ? 'Finalizing…' : 'Finalize'}
                </Button>
              ))}

            {isFinalized ? (
              <>
                <a
                  className={buttonVariants({ variant: 'dark', size: 'sm' })}
                  href={reportsApi.getExportUrl(teamId, report.reportDate, 'pdf')}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export PDF
                </a>
                <a
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  href={reportsApi.getExportUrl(teamId, report.reportDate, 'docx')}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export DOCX
                </a>
              </>
            ) : (
              <Badge
                variant="outline"
                size="toolbar"
                className="text-zinc-500"
                title="Team Lead must finalize before exporting"
              >
                Finalize to export
              </Badge>
            )}

            {session.member.role === 'lead' && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteReportMutation.isPending}
                onClick={() =>
                  setConfirmAction({ type: 'delete-report', reportDate: report.reportDate })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Log
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {actionError && <Alert variant="destructive">{actionError}</Alert>}
      {actionSuccess && <Alert variant="success">{actionSuccess}</Alert>}

      <EntryComposer
        teamId={teamId}
        reportDate={report.reportDate}
        dictionary={dictionary}
        members={members}
        currentMemberId={session.member.id}
        tableSections={report.groups.map((g) => ({
          categoryName: g.categoryName,
          titleName: g.titleName,
        }))}
        disabled={isFinalized}
      />

      {/* Interactive Daily Work Table */}
      <Card className="no-print border-t-2 border-t-primary">
        <CardHeader className="py-2.5">
          <CardTitle>Daily Work Table</CardTitle>
          <Badge variant="secondary" size="sm">
            {report.groups.length} sections
          </Badge>
        </CardHeader>

        <CardContent className="p-3">
          <div className="w-full overflow-x-auto rounded-md border border-zinc-200 bg-white">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-950 text-white border-b-2 border-b-primary">
                  <th className="w-[5.5%] border-r border-zinc-800 px-2.5 py-2.5 text-center text-xs font-bold">
                    Ser
                  </th>
                  <th className="w-[16.5%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                    Report Category
                  </th>
                  <th className="w-[23%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                    Title
                  </th>
                  <th className="w-[38.5%] border-r border-zinc-800 px-2.5 py-2.5 text-left text-xs font-bold">
                    Status
                  </th>
                  <th className="w-[16.5%] px-2.5 py-2.5 text-left text-xs font-bold">
                    Task Completed By
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.groups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                      No rows added yet. Use <strong>Add Work Entry</strong> above to log your first
                      entry.
                    </td>
                  </tr>
                )}
                {report.groups.map((group, gIdx) => {
                  const isEditingThisGroup = editingGroup?.groupId === group.id;
                  const isQuickAdding = quickAdd?.groupId === group.id;
                  const editCat = activeCategories.find(
                    (c) => c.name === editingGroup?.categoryName,
                  );
                  const editTitles = editCat?.titles ?? [];

                  return (
                    <Fragment key={group.id}>
                      <tr className="border-b border-zinc-200 last:border-b-0">
                        <td className="border-r border-zinc-200 p-2.5 text-center align-top">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-primary-border bg-accent text-xs font-extrabold text-primary-text">
                            {gIdx + 1}
                          </span>
                          {!isFinalized && (
                            <div className="mt-1.5 flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                className="h-6 w-6"
                                title="Move row up"
                                disabled={gIdx === 0 || reorderGroupsMutation.isPending}
                                onClick={() =>
                                  reorderGroupsMutation.mutate(
                                    moveItem(report.groups, gIdx, -1).map((g) => g.id),
                                  )
                                }
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                className="h-6 w-6"
                                title="Move row down"
                                disabled={
                                  gIdx === report.groups.length - 1 ||
                                  reorderGroupsMutation.isPending
                                }
                                onClick={() =>
                                  reorderGroupsMutation.mutate(
                                    moveItem(report.groups, gIdx, 1).map((g) => g.id),
                                  )
                                }
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>

                        <td className="border-r border-zinc-200 p-2.5 align-top">
                          <div className="font-bold text-zinc-950">{group.categoryName}</div>
                          {!isFinalized && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                title="Edit category & title"
                                onClick={() => startEditGroup(group)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon-xs"
                                title="Delete table row"
                                disabled={deleteGroupMutation.isPending}
                                onClick={() => setConfirmAction({ type: 'delete-group', group })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>

                        <td className="border-r border-zinc-200 p-2.5 align-top">
                          <div className="font-medium text-zinc-700 leading-snug">
                            {group.titleName}
                          </div>
                          {!isFinalized && (
                            <div className="mt-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                title="Toggle numbered (1. 2. 3.) vs plain text"
                                onClick={() =>
                                  toggleNumberingMutation.mutate({
                                    groupId: group.id,
                                    numberingMode:
                                      group.numberingMode === 'numbered' ? 'plain' : 'numbered',
                                  })
                                }
                              >
                                {group.numberingMode === 'numbered' ? '1. 2. 3.' : 'Plain'}
                              </Button>
                            </div>
                          )}
                        </td>

                        <td colSpan={2} className="p-0 align-top">
                          {group.entries.length === 0 ? (
                            <div className="flex items-center justify-between gap-3 bg-zinc-50/60 px-3 py-2.5">
                              <span className="text-xs text-zinc-500">No status added yet</span>
                              {!isFinalized && (
                                <Button
                                  type="button"
                                  size="xs"
                                  onClick={() =>
                                    setQuickAdd({
                                      groupId: group.id,
                                      categoryName: group.categoryName,
                                      titleName: group.titleName,
                                      communicationType: '',
                                      statusText: '',
                                      completedByMemberIds: session.member.id
                                        ? [session.member.id]
                                        : [],
                                    })
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                  Add Status
                                </Button>
                              )}
                            </div>
                          ) : (
                            <table className="w-full table-fixed border-collapse">
                              <colgroup>
                                <col style={{ width: '70%' }} />
                                <col style={{ width: '30%' }} />
                              </colgroup>
                              <tbody>
                                {(group.categoryName.trim().toLowerCase() === 'communication'
                                  ? sortCommunicationItems(group.entries)
                                  : group.entries
                                ).map((entry, eIdx) => {
                                  const isEditingThis = editingEntry?.entryId === entry.id;
                                  const editable = canMutateEntry(entry);

                                  if (isEditingThis && editingEntry) {
                                    return (
                                      <tr
                                        key={entry.id}
                                        className="border-b border-zinc-200 last:border-b-0"
                                      >
                                        <td colSpan={2} className="bg-zinc-50 p-2.5">
                                          <div className="grid gap-3 rounded-md border border-primary-border border-l-4 border-l-primary bg-white p-3">
                                            {editingEntry.conflictCurrent && (
                                              <Alert variant="warning" className="grid gap-2">
                                                <div>
                                                  <strong>Edit conflict:</strong> Another member
                                                  updated this entry.
                                                  <div className="mt-1 text-xs">
                                                    <em>Their version:</em> &ldquo;
                                                    {editingEntry.conflictCurrent.statusText}
                                                    &rdquo; (by{' '}
                                                    {
                                                      editingEntry.conflictCurrent
                                                        .completedByDisplay
                                                    }
                                                    )
                                                  </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  <Button
                                                    type="button"
                                                    size="xs"
                                                    onClick={() =>
                                                      updateEntryMutation.mutate({
                                                        entryId: editingEntry.entryId,
                                                        statusText: editingEntry.statusText,
                                                        completedByMemberId:
                                                          editingEntry.completedByMemberId,
                                                        completedByLabel:
                                                          editingEntry.completedByLabel,
                                                        version:
                                                          editingEntry.conflictCurrent!.version,
                                                      })
                                                    }
                                                  >
                                                    Keep Mine
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="xs"
                                                    onClick={() => {
                                                      setEditingEntry(null);
                                                      void queryClient.invalidateQueries({
                                                        queryKey: ['report', teamId],
                                                      });
                                                    }}
                                                  >
                                                    Take Theirs
                                                  </Button>
                                                </div>
                                              </Alert>
                                            )}

                                            <div className="grid gap-1.5">
                                              <Label>Status</Label>
                                              <Textarea
                                                rows={3}
                                                value={editingEntry.statusText}
                                                onChange={(e) =>
                                                  setEditingEntry({
                                                    ...editingEntry,
                                                    statusText: e.target.value,
                                                  })
                                                }
                                              />
                                            </div>

                                            <div className="grid gap-1.5">
                                              <Label>Task Completed By</Label>
                                              <div className="flex flex-wrap gap-1.5">
                                                {activeMembers.map((m) => {
                                                  const selected =
                                                    editingEntry.completedByMemberId === m.id;
                                                  return (
                                                    <Button
                                                      key={m.id}
                                                      type="button"
                                                      size="xs"
                                                      variant={selected ? 'dark' : 'outline'}
                                                      onClick={() =>
                                                        setEditingEntry({
                                                          ...editingEntry,
                                                          completedByMemberId: selected
                                                            ? null
                                                            : m.id,
                                                          completedByLabel: null,
                                                        })
                                                      }
                                                    >
                                                      {m.displayName}
                                                    </Button>
                                                  );
                                                })}
                                              </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={updateEntryMutation.isPending}
                                                onClick={() =>
                                                  updateEntryMutation.mutate({
                                                    entryId: editingEntry.entryId,
                                                    statusText: editingEntry.statusText,
                                                    completedByMemberId:
                                                      editingEntry.completedByMemberId,
                                                    completedByLabel: editingEntry.completedByLabel,
                                                    version: editingEntry.version,
                                                  })
                                                }
                                              >
                                                {updateEntryMutation.isPending ? 'Saving…' : 'Save'}
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setEditingEntry(null)}
                                              >
                                                Cancel
                                              </Button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return (
                                    <tr
                                      key={entry.id}
                                      className="border-b border-zinc-200 last:border-b-0"
                                    >
                                      <td className="p-2.5 align-top">
                                        <div className="whitespace-pre-wrap text-zinc-950 leading-relaxed">
                                          {group.numberingMode === 'numbered' ? (
                                            <span className="mr-1.5 font-bold text-primary-text">
                                              {eIdx + 1}.
                                            </span>
                                          ) : null}
                                          {entry.statusText}
                                        </div>
                                        {!isFinalized && (
                                          <div className="mt-2 flex flex-wrap items-center gap-1">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon-xs"
                                              title="Move status up"
                                              disabled={
                                                eIdx === 0 || reorderEntriesMutation.isPending
                                              }
                                              onClick={() =>
                                                reorderEntriesMutation.mutate({
                                                  groupId: group.id,
                                                  ids: moveItem(
                                                    group.categoryName.trim().toLowerCase() ===
                                                      'communication'
                                                      ? sortCommunicationItems(group.entries)
                                                      : group.entries,
                                                    eIdx,
                                                    -1,
                                                  ).map((item) => item.id),
                                                })
                                              }
                                            >
                                              <ArrowUp className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon-xs"
                                              title="Move status down"
                                              disabled={
                                                eIdx === group.entries.length - 1 ||
                                                reorderEntriesMutation.isPending
                                              }
                                              onClick={() =>
                                                reorderEntriesMutation.mutate({
                                                  groupId: group.id,
                                                  ids: moveItem(
                                                    group.categoryName.trim().toLowerCase() ===
                                                      'communication'
                                                      ? sortCommunicationItems(group.entries)
                                                      : group.entries,
                                                    eIdx,
                                                    1,
                                                  ).map((item) => item.id),
                                                })
                                              }
                                            >
                                              <ArrowDown className="h-3 w-3" />
                                            </Button>
                                            {editable && (
                                              <>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="icon-xs"
                                                  title="Edit status"
                                                  onClick={() => startEditEntry(entry)}
                                                >
                                                  <Pencil className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="icon-xs"
                                                  title="Move to follow-up"
                                                  disabled={
                                                    promoteFollowupMutation.isPending ||
                                                    entry.id.startsWith('optimistic-')
                                                  }
                                                  onClick={() => {
                                                    setActionSuccess(null);
                                                    promoteFollowupMutation.mutate(entry.id);
                                                  }}
                                                >
                                                  <Forward className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="destructive"
                                                  size="icon-xs"
                                                  title="Delete status"
                                                  onClick={() =>
                                                    setConfirmAction({
                                                      type: 'delete-entry',
                                                      entryId: entry.id,
                                                    })
                                                  }
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                      <td className="border-l border-zinc-200 p-2.5 align-top">
                                        {!isNilCommunicationStatus(entry.statusText) &&
                                        entry.completedByDisplay ? (
                                          <Badge variant="secondary" size="sm" className="normal-case">
                                            {entry.completedByDisplay}
                                          </Badge>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {!isFinalized && (
                                  <tr>
                                    <td
                                      colSpan={2}
                                      className="border-t border-zinc-200 bg-zinc-50 px-2.5 py-1.5"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="xs"
                                          title={`Add status to Ser ${gIdx + 1}`}
                                          onClick={() =>
                                            setQuickAdd({
                                              groupId: group.id,
                                              categoryName: group.categoryName,
                                              titleName: group.titleName,
                                              communicationType: '',
                                              statusText: '',
                                              completedByMemberIds: session.member.id
                                                ? [session.member.id]
                                                : [],
                                            })
                                          }
                                        >
                                          <Plus className="h-3 w-3" />
                                          Add
                                        </Button>
                                        {(() => {
                                          const baseEntries =
                                            group.categoryName.trim().toLowerCase() ===
                                            'communication'
                                              ? sortCommunicationItems(group.entries)
                                              : group.entries;
                                          const groupMembers = Array.from(
                                            new Map(
                                              baseEntries
                                                .filter(
                                                  (e) =>
                                                    e.completedByMemberId && e.completedByDisplay,
                                                )
                                                .map((e) => [
                                                  e.completedByMemberId!,
                                                  e.completedByDisplay,
                                                ]),
                                            ).entries(),
                                          );
                                          if (baseEntries.length <= 1 || groupMembers.length < 2) {
                                            return null;
                                          }
                                          const memberIdsOrder = groupMembers.map(([mId]) => mId);
                                          return (
                                            <div className="no-print flex flex-wrap items-center gap-1.5">
                                              <span className="text-[11px] font-medium text-zinc-500">
                                                Member order (drag to reorder):
                                              </span>
                                              {groupMembers.map(([mId, mName], mIdx) => {
                                                const isDragging =
                                                  dragMember?.groupId === group.id &&
                                                  dragMember.memberId === mId;
                                                const isDragTarget =
                                                  dragOverMember?.groupId === group.id &&
                                                  dragOverMember.memberId === mId &&
                                                  dragMember?.memberId !== mId;
                                                return (
                                                <div
                                                  key={mId}
                                                  draggable={!reorderEntriesMutation.isPending}
                                                  onDragStart={(e) => {
                                                    setDragMember({ groupId: group.id, memberId: mId });
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    e.dataTransfer.setData('text/plain', mId);
                                                  }}
                                                  onDragOver={(e) => {
                                                    if (
                                                      dragMember?.groupId === group.id &&
                                                      dragMember.memberId !== mId
                                                    ) {
                                                      e.preventDefault();
                                                      e.dataTransfer.dropEffect = 'move';
                                                      if (
                                                        dragOverMember?.groupId !== group.id ||
                                                        dragOverMember.memberId !== mId
                                                      ) {
                                                        setDragOverMember({
                                                          groupId: group.id,
                                                          memberId: mId,
                                                        });
                                                      }
                                                    }
                                                  }}
                                                  onDragLeave={() => {
                                                    if (
                                                      dragOverMember?.groupId === group.id &&
                                                      dragOverMember.memberId === mId
                                                    ) {
                                                      setDragOverMember(null);
                                                    }
                                                  }}
                                                  onDrop={(e) => {
                                                    e.preventDefault();
                                                    const draggedId = dragMember?.memberId;
                                                    const fromGroup = dragMember?.groupId;
                                                    setDragMember(null);
                                                    setDragOverMember(null);
                                                    if (
                                                      fromGroup !== group.id ||
                                                      !draggedId ||
                                                      draggedId === mId
                                                    ) {
                                                      return;
                                                    }
                                                    const fromIdx = memberIdsOrder.indexOf(draggedId);
                                                    const toIdx = memberIdsOrder.indexOf(mId);
                                                    if (fromIdx === -1 || toIdx === -1) return;
                                                    const nextOrder = [...memberIdsOrder];
                                                    const [moved] = nextOrder.splice(fromIdx, 1);
                                                    nextOrder.splice(toIdx, 0, moved!);
                                                    const ordered = orderEntriesByMemberSequence(
                                                      baseEntries,
                                                      nextOrder,
                                                    );
                                                    reorderEntriesMutation.mutate({
                                                      groupId: group.id,
                                                      ids: ordered.map((item) => item.id),
                                                    });
                                                  }}
                                                  onDragEnd={() => {
                                                    setDragMember(null);
                                                    setDragOverMember(null);
                                                  }}
                                                  className={cn(
                                                    'inline-flex cursor-grab items-center gap-0.5 rounded-md border bg-white px-1.5 py-0.5 text-xs text-zinc-800 shadow-2xs transition-colors active:cursor-grabbing',
                                                    isDragTarget
                                                      ? 'border-primary bg-accent ring-1 ring-primary'
                                                      : 'border-zinc-200',
                                                    isDragging && 'opacity-50',
                                                  )}
                                                >
                                                  <GripVertical className="h-3 w-3 shrink-0 text-zinc-400" />
                                                  <button
                                                    type="button"
                                                    title={`Move ${mName} earlier`}
                                                    disabled={
                                                      mIdx === 0 || reorderEntriesMutation.isPending
                                                    }
                                                    onClick={() => {
                                                      const nextOrder = moveItem(
                                                        memberIdsOrder,
                                                        mIdx,
                                                        -1,
                                                      );
                                                      const ordered = orderEntriesByMemberSequence(
                                                        baseEntries,
                                                        nextOrder,
                                                      );
                                                      reorderEntriesMutation.mutate({
                                                        groupId: group.id,
                                                        ids: ordered.map((item) => item.id),
                                                      });
                                                    }}
                                                    className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30"
                                                  >
                                                    <ArrowLeft className="h-3 w-3" />
                                                  </button>
                                                  <span className="px-1 font-medium select-none">
                                                    {mIdx + 1}. {mName}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    title={`Move ${mName} later`}
                                                    disabled={
                                                      mIdx === groupMembers.length - 1 ||
                                                      reorderEntriesMutation.isPending
                                                    }
                                                    onClick={() => {
                                                      const nextOrder = moveItem(
                                                        memberIdsOrder,
                                                        mIdx,
                                                        1,
                                                      );
                                                      const ordered = orderEntriesByMemberSequence(
                                                        baseEntries,
                                                        nextOrder,
                                                      );
                                                      reorderEntriesMutation.mutate({
                                                        groupId: group.id,
                                                        ids: ordered.map((item) => item.id),
                                                      });
                                                    }}
                                                    className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30"
                                                  >
                                                    <ArrowRight className="h-3 w-3" />
                                                  </button>
                                                </div>
                                                );
                                              })}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>

                      {isEditingThisGroup && editingGroup && (
                        <tr className="border-b border-zinc-200">
                          <td colSpan={5} className="bg-zinc-50 p-3">
                            <div className="grid gap-3 rounded-md border border-primary-border border-l-4 border-l-primary bg-white p-3.5">
                              <div className="border-b border-zinc-100 pb-2 text-xs font-bold text-zinc-950">
                                Edit Category &amp; Title for Ser {gIdx + 1}
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                  <Label>Report Category</Label>
                                  <Select
                                    value={editingGroup.categoryName}
                                    onValueChange={(nextCatName) => {
                                      const nextCat = activeCategories.find(
                                        (c) => c.name === nextCatName,
                                      );
                                      setEditingGroup({
                                        ...editingGroup,
                                        categoryName: nextCatName,
                                        titleName:
                                          nextCat?.titles[0]?.name ?? editingGroup.titleName,
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {!activeCategories.some(
                                        (c) => c.name === editingGroup.categoryName,
                                      ) && (
                                        <SelectItem value={editingGroup.categoryName}>
                                          {editingGroup.categoryName}
                                        </SelectItem>
                                      )}
                                      {activeCategories.map((c) => (
                                        <SelectItem key={c.id} value={c.name}>
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid gap-1.5">
                                  <Label>Title</Label>
                                  <Select
                                    value={editingGroup.titleName}
                                    onValueChange={(val) =>
                                      setEditingGroup({ ...editingGroup, titleName: val })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {!editTitles.some(
                                        (t) => t.name === editingGroup.titleName,
                                      ) && (
                                        <SelectItem value={editingGroup.titleName}>
                                          {editingGroup.titleName}
                                        </SelectItem>
                                      )}
                                      {editTitles.map((t) => (
                                        <SelectItem key={t.id} value={t.name}>
                                          {t.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={updateGroupMutation.isPending}
                                  onClick={() => updateGroupMutation.mutate(editingGroup)}
                                >
                                  {updateGroupMutation.isPending ? 'Saving…' : 'Save Changes'}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingGroup(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {isQuickAdding && quickAdd && (
                        <tr className="border-b border-zinc-200">
                          <td colSpan={5} className="bg-zinc-50 p-3">
                            <div className="grid gap-3 rounded-md border border-primary-border border-l-4 border-l-primary bg-white p-3.5">
                              <div className="border-b border-zinc-100 pb-2 text-xs font-bold text-zinc-950">
                                Add Status to Ser {gIdx + 1} ({group.categoryName} /{' '}
                                {group.titleName})
                              </div>
                              <div className="relative grid gap-1.5">
                                <Label>Status</Label>
                                <div
                                  className={
                                    quickAdd.categoryName.trim().toLowerCase() === 'communication'
                                      ? 'flex items-start gap-2'
                                      : 'grid'
                                  }
                                >
                                  {quickAdd.categoryName.trim().toLowerCase() ===
                                    'communication' && (
                                    <Select
                                      className="w-[148px] shrink-0"
                                      value={quickAdd.communicationType}
                                      onValueChange={(val) =>
                                        setQuickAdd({ ...quickAdd, communicationType: val })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Sailor / Officer" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Sailor">Sailor</SelectItem>
                                        <SelectItem value="Officer">Officer</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                  <Textarea
                                    rows={2}
                                    className="min-w-0 flex-1"
                                    value={quickAdd.statusText}
                                    onFocus={() => setQuickAddStatusFocused(true)}
                                    onBlur={() => setQuickAddStatusFocused(false)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setQuickAddStatusFocused(false);
                                    }}
                                    onChange={(e) =>
                                      setQuickAdd({ ...quickAdd, statusText: e.target.value })
                                    }
                                    placeholder={
                                      quickAdd.categoryName.trim().toLowerCase() ===
                                      'communication'
                                        ? 'Write details beside Sailor / Officer...'
                                        : 'Enter status...'
                                    }
                                  />
                                </div>
                                {quickAddStatusFocused && frequentStatuses.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <span className="text-[11px] font-semibold text-zinc-500">
                                      Frequently Used:
                                    </span>
                                    {frequentStatuses.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setQuickAdd({
                                            ...quickAdd,
                                            statusText: item.statusText,
                                          });
                                          setQuickAddStatusFocused(false);
                                        }}
                                        className="cursor-pointer rounded-md border border-primary-border bg-accent px-2.5 py-1 text-left text-xs font-medium text-accent-foreground transition-colors hover:bg-primary hover:text-white"
                                        title="Click to paste into status box"
                                      >
                                        {item.statusText}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="grid gap-1.5">
                                <Label>Task Completed By (optional)</Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {activeMembers.map((m) => {
                                    const selected = quickAdd.completedByMemberIds.includes(m.id);
                                    return (
                                      <Button
                                        key={m.id}
                                        type="button"
                                        size="xs"
                                        variant={selected ? 'dark' : 'outline'}
                                        onClick={() => {
                                          const exists = quickAdd.completedByMemberIds.includes(
                                            m.id,
                                          );
                                          const next = exists
                                            ? quickAdd.completedByMemberIds.filter(
                                                (id) => id !== m.id,
                                              )
                                            : [...quickAdd.completedByMemberIds, m.id];
                                          setQuickAdd({
                                            ...quickAdd,
                                            completedByMemberIds: next,
                                          });
                                        }}
                                      >
                                        {m.displayName}
                                      </Button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={
                                    quickAddMutation.isPending || !quickAdd.statusText.trim()
                                  }
                                  onClick={() => quickAddMutation.mutate(quickAdd)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {quickAddMutation.isPending ? 'Adding…' : 'Add Status'}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setQuickAdd(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Live Document Preview */}
      <div className="flex flex-col gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-zinc-950">
            {isFinalized
              ? 'Finalized Report Preview (Full Team)'
              : `Live Preview (${session.member.displayName}'s Entries)`}
          </h2>
          {!isFinalized && (
            <span className="text-xs text-zinc-500">
              Showing your entries while in draft; full team document appears once finalized.
            </span>
          )}
        </div>
        <ReportPreview
          report={report}
          documentTitle={session.team.documentTitle}
          hasLogo={session.team.hasLogo}
          filterMemberId={isFinalized ? undefined : session.member.id}
          filterUserId={isFinalized ? undefined : session.user.id}
          fontFamily={settingsQuery.data?.documentFontFamily}
          fontSizePt={settingsQuery.data?.documentFontSizePt}
        />
      </div>

      {/* First-Time Team Categories & Titles Setup Popup */}
      {workspaceQuery.isSuccess &&
        dictionary.length === 0 &&
        report.groups.length === 0 &&
        !setupDismissed &&
        session.member.role === 'lead' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl">
              <h3 className="text-base font-bold text-zinc-950">
                Set Up Categories &amp; Titles for {session.team.name}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Choose which Categories &amp; Titles belong in your fixed{' '}
                <strong>Daily Work Table</strong> vs your <strong>Follow-up Table</strong>. This
                setup is saved for every day.
              </p>

              {setupError && (
                <Alert variant="destructive" className="mt-3">
                  {setupError}
                </Alert>
              )}

              <div className="mt-3 grid max-h-72 gap-2.5 overflow-y-auto pr-1">
                {setupPairs.map((pair, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_140px_auto]"
                  >
                    <Input
                      placeholder="Category (e.g. Support)"
                      value={pair.category}
                      onChange={(e) => {
                        const next = [...setupPairs];
                        next[idx] = { ...pair, category: e.target.value };
                        setSetupPairs(next);
                      }}
                    />
                    <Input
                      placeholder="Title (e.g. Daily Calls)"
                      value={pair.title}
                      onChange={(e) => {
                        const next = [...setupPairs];
                        next[idx] = { ...pair, title: e.target.value };
                        setSetupPairs(next);
                      }}
                    />
                    <Select
                      value={pair.scope}
                      onValueChange={(val) => {
                        const next = [...setupPairs];
                        next[idx] = { ...pair, scope: val as 'daily' | 'followup' };
                        setSetupPairs(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily Table</SelectItem>
                        <SelectItem value="followup">Follow-up</SelectItem>
                      </SelectContent>
                    </Select>
                    {setupPairs.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSetupPairs(setupPairs.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSetupPairs([...setupPairs, { category: '', title: '', scope: 'daily' }])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Another Row
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={setupSaving}
                    onClick={() => {
                      try {
                        window.localStorage.setItem(`worklog:setupDismissed:${teamId}`, '1');
                      } catch {
                        // Ignore
                      }
                      setSetupDismissed(true);
                    }}
                  >
                    Skip (Start Blank)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={setupSaving}
                    onClick={async () => {
                      const valid = setupPairs
                        .map((p) => ({
                          category: p.category.trim(),
                          title: p.title.trim(),
                          scope: p.scope,
                        }))
                        .filter((p) => p.category.length > 0);
                      if (valid.length === 0) {
                        setSetupError('Add at least one category, or click Skip (Start Blank).');
                        return;
                      }
                      setSetupError(null);
                      setSetupSaving(true);
                      try {
                        const catCache = new Map<string, string>();
                        for (const row of valid) {
                          const key = row.category.toLowerCase();
                          let catId = catCache.get(key);
                          if (!catId) {
                            const createdCat = await dictionaryApi.createCategory(
                              teamId,
                              row.category,
                            );
                            catId = createdCat.id;
                            catCache.set(key, catId);
                          }
                          if (row.title) {
                            await dictionaryApi.createTitle(teamId, catId, row.title, row.scope);
                          }
                        }
                        try {
                          window.localStorage.setItem(`worklog:setupDismissed:${teamId}`, '1');
                        } catch {
                          // Ignore
                        }
                        setSetupDismissed(true);
                        await queryClient.invalidateQueries({ queryKey: ['report', teamId] });
                        await queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
                      } catch (err) {
                        setSetupError(
                          err instanceof Error ? err.message : 'Failed to save categories',
                        );
                      } finally {
                        setSetupSaving(false);
                      }
                    }}
                  >
                    {setupSaving ? 'Saving…' : 'Save Categories'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* shadcn Confirmation & Finalize Dialogs */}
      {confirmDialogConfig && (
        <ConfirmDialog
          open={Boolean(confirmDialogConfig)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmDialogConfig.title}
          description={confirmDialogConfig.description}
          confirmLabel={confirmDialogConfig.confirmLabel}
          destructive
          pending={confirmDialogConfig.pending}
          onConfirm={confirmDialogConfig.onConfirm}
        />
      )}

      <PromptDialog
        open={finalizePromptOpen}
        onOpenChange={setFinalizePromptOpen}
        title="Finalize Daily Report"
        description="Confirm the Prepared By name that will appear at the bottom of the exported DOCX and PDF."
        fieldLabel="Prepared By"
        initialValue={report.preparedByName}
        confirmLabel="Finalize Report"
        pending={finalizeMutation.isPending}
        onConfirm={(val) => finalizeMutation.mutate(val.trim() || report.preparedByName)}
      />
    </div>
  );
}
