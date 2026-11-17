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
  ArrowUp,
  Calendar,
  Check,
  Download,
  Forward,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  ApiError,
  reportsApi,
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

function moveSelectedItems<T extends { id: string }>(
  items: T[],
  selectedIds: Set<string>,
  direction: -1 | 1,
): T[] {
  const copy = [...items];
  if (direction === -1) {
    for (let i = 1; i < copy.length; i += 1) {
      if (selectedIds.has(copy[i]!.id) && !selectedIds.has(copy[i - 1]!.id)) {
        const tmp = copy[i - 1]!;
        copy[i - 1] = copy[i]!;
        copy[i] = tmp;
      }
    }
  } else {
    for (let i = copy.length - 2; i >= 0; i -= 1) {
      if (selectedIds.has(copy[i]!.id) && !selectedIds.has(copy[i + 1]!.id)) {
        const tmp = copy[i + 1]!;
        copy[i + 1] = copy[i]!;
        copy[i] = tmp;
      }
    }
  }
  return copy;
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
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set());

  function toggleEntrySelection(entryId: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  function clearGroupSelection(entryIds: string[]) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      for (const id of entryIds) next.delete(id);
      return next;
    });
  }

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
    return session.member.role === 'lead' || entry.createdByUserId === session.user.id;
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
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-orange-300 bg-orange-50 text-xs font-extrabold text-orange-700">
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
                          {!isFinalized &&
                            group.categoryName.trim().toLowerCase() === 'support' && (
                              <div className="mt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  title="Toggle numbered vs plain status lines"
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
                                {(() => {
                                  const orderedEntries =
                                    group.categoryName.trim().toLowerCase() === 'communication'
                                      ? sortCommunicationItems(group.entries)
                                      : group.entries;
                                  const selectedInGroup = orderedEntries.filter((e) =>
                                    selectedEntryIds.has(e.id),
                                  );
                                  const canBulkMoveUp =
                                    selectedInGroup.length > 0 &&
                                    orderedEntries.some(
                                      (e, idx) =>
                                        idx > 0 &&
                                        selectedEntryIds.has(e.id) &&
                                        !selectedEntryIds.has(orderedEntries[idx - 1]!.id),
                                    );
                                  const canBulkMoveDown =
                                    selectedInGroup.length > 0 &&
                                    orderedEntries.some(
                                      (e, idx) =>
                                        idx < orderedEntries.length - 1 &&
                                        selectedEntryIds.has(e.id) &&
                                        !selectedEntryIds.has(orderedEntries[idx + 1]!.id),
                                    );

                                  return (
                                    <>
                                      {!isFinalized && selectedInGroup.length > 0 && (
                                        <tr className="no-print border-b border-orange-200 bg-orange-50/70">
                                          <td colSpan={2} className="px-2.5 py-1.5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="text-xs font-semibold text-orange-800">
                                                {selectedInGroup.length} selected
                                              </span>
                                              <div className="flex items-center gap-1.5">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="xs"
                                                  disabled={
                                                    !canBulkMoveUp ||
                                                    reorderEntriesMutation.isPending
                                                  }
                                                  onClick={() =>
                                                    reorderEntriesMutation.mutate({
                                                      groupId: group.id,
                                                      ids: moveSelectedItems(
                                                        orderedEntries,
                                                        selectedEntryIds,
                                                        -1,
                                                      ).map((item) => item.id),
                                                    })
                                                  }
                                                >
                                                  <ArrowUp className="h-3 w-3" />
                                                  Move Up
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="xs"
                                                  disabled={
                                                    !canBulkMoveDown ||
                                                    reorderEntriesMutation.isPending
                                                  }
                                                  onClick={() =>
                                                    reorderEntriesMutation.mutate({
                                                      groupId: group.id,
                                                      ids: moveSelectedItems(
                                                        orderedEntries,
                                                        selectedEntryIds,
                                                        1,
                                                      ).map((item) => item.id),
                                                    })
                                                  }
                                                >
                                                  <ArrowDown className="h-3 w-3" />
                                                  Move Down
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="xs"
                                                  onClick={() =>
                                                    clearGroupSelection(
                                                      orderedEntries.map((e) => e.id),
                                                    )
                                                  }
                                                >
                                                  Clear
                                                </Button>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                      {orderedEntries.map((entry, eIdx) => {
                                  const isEditingThis = editingEntry?.entryId === entry.id;
                                  const editable = canMutateEntry(entry);

                                  if (isEditingThis && editingEntry) {
                                    return (
                                      <tr
                                        key={entry.id}
                                        className="border-b border-zinc-200 last:border-b-0"
                                      >
                                        <td colSpan={2} className="bg-zinc-50 p-2.5">
                                          <div className="grid gap-3 rounded-md border border-orange-300 border-l-4 border-l-primary bg-white p-3">
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
                                            <span className="mr-1.5 font-bold text-orange-600">
                                              {eIdx + 1}.
                                            </span>
                                          ) : null}
                                          {entry.statusText}
                                        </div>
                                        {!isFinalized && (
                                          <div className="mt-2 flex flex-wrap items-center gap-1">
                                            {group.entries.length > 1 && (
                                              <input
                                                type="checkbox"
                                                aria-label="Select entry for bulk move"
                                                title="Select to move multiple entries at once"
                                                className="mr-1 h-3.5 w-3.5 cursor-pointer rounded border-zinc-300 accent-orange-500"
                                                checked={selectedEntryIds.has(entry.id)}
                                                onChange={() => toggleEntrySelection(entry.id)}
                                              />
                                            )}
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
                                    </>
                                  );
                                })()}
                                {!isFinalized && (
                                  <tr>
                                    <td
                                      colSpan={2}
                                      className="border-t border-zinc-200 bg-zinc-50 px-2.5 py-1.5"
                                    >
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
                            <div className="grid gap-3 rounded-md border border-orange-300 border-l-4 border-l-primary bg-white p-3.5">
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
                            <div className="grid gap-3 rounded-md border border-orange-300 border-l-4 border-l-primary bg-white p-3.5">
                              <div className="border-b border-zinc-100 pb-2 text-xs font-bold text-zinc-950">
                                Add Status to Ser {gIdx + 1} ({group.categoryName} /{' '}
                                {group.titleName})
                              </div>
                              <div className="grid gap-1.5">
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
                                      className="w-[125px] shrink-0"
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
        />
      </div>

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
