import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthSession,
  DailyReportDto,
  WorkEntryDto,
  WorkGroupDto,
} from '@cghq/contracts';
import {
  ApiError,
  dictionaryApi,
  followupsApi,
  reportsApi,
  teamsApi,
} from '../api/client.js';
import { EntryComposer } from '../components/EntryComposer.js';
import { ReportPreview } from '../components/ReportPreview.js';

interface ReportScreenProps {
  session: AuthSession;
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
  statusText: string;
  completedByMemberIds: string[];
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  const [removed] = copy.splice(index, 1);
  copy.splice(target, 0, removed!);
  return copy;
}

export function ReportScreen({ session }: ReportScreenProps) {
  const { date: routeDate } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const teamId = session.team.id;

  const [actionError, setActionError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<EditingEntryState | null>(null);
  const [editingGroup, setEditingGroup] = useState<EditingGroupState | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null);

  const reportQuery = useQuery({
    queryKey: ['report', teamId, routeDate ?? 'today'],
    queryFn: () =>
      routeDate ? reportsApi.getByDate(teamId, routeDate) : reportsApi.getToday(teamId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const dictionaryQuery = useQuery({
    queryKey: ['dictionary', teamId],
    queryFn: () => dictionaryApi.list(teamId),
  });

  const membersQuery = useQuery({
    queryKey: ['members', teamId],
    queryFn: () => teamsApi.listMembers(teamId),
  });

  const activeCategories = useMemo(
    () =>
      (dictionaryQuery.data ?? [])
        .filter((c) => c.isActive)
        .map((c) => ({
          ...c,
          titles: c.titles.filter((t) => t.isActive),
        }))
        .filter((c) => c.titles.length > 0),
    [dictionaryQuery.data],
  );

  const report = reportQuery.data;
  const activeDate = routeDate ?? report?.reportDate ?? '';
  const isFinalized = report?.status === 'finalized';
  const showNewDayBanner = Boolean(report && report.todayDate !== report.reportDate);

  function syncReportCache(updated?: DailyReportDto) {
    if (updated) {
      queryClient.setQueryData(['report', teamId, updated.reportDate], updated);
      if (!routeDate) {
        queryClient.setQueryData(['report', teamId, 'today'], updated);
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
    mutationFn: (payload: {
      categoryName: string;
      titleName: string;
      statusText: string;
      completedByMemberId: string | null;
      completedByLabel: string | null;
    }) => followupsApi.create(teamId, payload),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      syncReportCache();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to promote to follow-up');
    },
  });

  const quickAddMutation = useMutation({
    mutationFn: (payload: QuickAddState) => {
      const statusLines = payload.statusText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      return reportsApi.createEntry(teamId, activeDate, {
        categoryName: payload.categoryName,
        titleName: payload.titleName,
        statusLines,
        completedByMemberIds: payload.completedByMemberIds.length
          ? payload.completedByMemberIds
          : [session.member.id],
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

  if (reportQuery.isLoading) {
    return (
      <div className="card">
        <p className="muted">Loading daily report...</p>
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    const err = reportQuery.error;
    return (
      <div className="card">
        <h2>Unable to load report</h2>
        <p className="alert-error">
          {err instanceof ApiError ? err.message : 'Could not load report for this date.'}
        </p>
        <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
          Go to Today&apos;s Report
        </button>
      </div>
    );
  }

  const activeMembers = (membersQuery.data ?? []).filter((m) => m.isActive);

  return (
    <div className="report-page">
      {showNewDayBanner && (
        <div className="banner-info">
          <span>
            New day started in {session.team.timezone}: today is{' '}
            <strong>{report.todayDate}</strong> (you are viewing{' '}
            <strong>{report.reportDate}</strong>).
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/')}>
            Jump to Today
          </button>
        </div>
      )}

      <div className="card report-toolbar">
        <div className="toolbar-left">
          <label className="date-picker-label">
            <span>Report Date</span>
            <input
              type="date"
              value={report.reportDate}
              max={report.todayDate}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                if (next === report.todayDate) {
                  navigate('/');
                } else {
                  navigate(`/reports/${next}`);
                }
              }}
            />
          </label>
          <span className={`badge badge-${report.status}`}>
            {report.status.toUpperCase()} · rev {report.revision}
          </span>
        </div>

        <div className="toolbar-actions">
          {session.member.role === 'lead' &&
            (isFinalized ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={reopenMutation.isPending}
                onClick={() => reopenMutation.mutate()}
              >
                {reopenMutation.isPending ? 'Reopening...' : 'Reopen'}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={finalizeMutation.isPending}
                onClick={() => {
                  const chosen = window.prompt(
                    'Confirm "Prepared By" name for this finalized report:',
                    report.preparedByName,
                  );
                  if (chosen !== null) {
                    finalizeMutation.mutate(chosen.trim() || report.preparedByName);
                  }
                }}
              >
                {finalizeMutation.isPending ? 'Finalizing...' : 'Finalize'}
              </button>
            ))}

          {isFinalized ? (
            <>
              <a
                className="btn-primary btn-sm"
                href={reportsApi.getExportUrl(teamId, report.reportDate, 'pdf')}
              >
                Export PDF
              </a>
              <a
                className="btn-secondary btn-sm"
                href={reportsApi.getExportUrl(teamId, report.reportDate, 'docx')}
              >
                Export DOCX
              </a>
            </>
          ) : (
            <span className="muted" title="Team Lead must finalize before exporting (Q7)">
              Finalize to export
            </span>
          )}
        </div>
      </div>

      {actionError && <div className="alert-error">{actionError}</div>}

      <div className="report-workspace">
        <EntryComposer
          teamId={teamId}
          reportDate={report.reportDate}
          dictionary={dictionaryQuery.data ?? []}
          members={membersQuery.data ?? []}
          currentMemberId={session.member.id}
          disabled={isFinalized}
        />

        <div className="card">
          <div className="section-heading">
            <h2>Daily Work Table ({report.groups.length} sections)</h2>
            <span className="muted">Auto-refreshes every 15s</span>
          </div>

          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th className="col-ser">Ser</th>
                  <th className="col-cat">Report Category</th>
                  <th className="col-title">Title</th>
                  <th className="col-status">Status</th>
                  <th className="col-by">Task Completed By</th>
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
                      <tr>
                        <td className="col-ser">
                          <div>
                            <strong>{gIdx + 1}</strong>
                          </div>
                          {!isFinalized && (
                            <div className="ser-controls">
                              <button
                                type="button"
                                className="btn-secondary btn-xs"
                                title="Move row up"
                                disabled={gIdx === 0 || reorderGroupsMutation.isPending}
                                onClick={() =>
                                  reorderGroupsMutation.mutate(
                                    moveItem(report.groups, gIdx, -1).map((g) => g.id),
                                  )
                                }
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-xs"
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
                                ↓
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="col-cat">
                          <div>{group.categoryName}</div>
                          {!isFinalized && (
                            <button
                              type="button"
                              className="btn-secondary btn-xs"
                              style={{ marginTop: 6 }}
                              onClick={() => startEditGroup(group)}
                            >
                              Edit
                            </button>
                          )}
                        </td>

                        <td className="col-title">
                          <div>{group.titleName}</div>
                          {!isFinalized &&
                            group.categoryName.trim().toLowerCase() === 'support' && (
                              <button
                                type="button"
                                className="btn-secondary btn-xs"
                                style={{ marginTop: 6 }}
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
                              </button>
                            )}
                        </td>

                        <td className="col-status" colSpan={2} style={{ padding: 0 }}>
                          {group.entries.length === 0 ? (
                            <div className="table-empty-slot">
                              <span className="muted">No status added yet</span>
                              {!isFinalized && (
                                <button
                                  type="button"
                                  className="btn-primary btn-xs"
                                  onClick={() =>
                                    setQuickAdd({
                                      groupId: group.id,
                                      categoryName: group.categoryName,
                                      titleName: group.titleName,
                                      statusText: '',
                                      completedByMemberIds: [session.member.id],
                                    })
                                  }
                                >
                                  + Add Status
                                </button>
                              )}
                            </div>
                          ) : (
                            <table className="inner-status-table">
                              <tbody>
                                {group.entries.map((entry, eIdx) => {
                                  const isEditingThis = editingEntry?.entryId === entry.id;
                                  const editable = canMutateEntry(entry);

                                  if (isEditingThis && editingEntry) {
                                    return (
                                      <tr key={entry.id}>
                                        <td colSpan={2} className="followup-edit-cell">
                                          <div className="entry-edit-box">
                                            {editingEntry.conflictCurrent && (
                                              <div className="alert-warn conflict-box">
                                                <div>
                                                  <strong>Edit conflict (FR-32):</strong> Another
                                                  member updated this entry.
                                                  <div className="conflict-theirs">
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
                                                <div className="conflict-actions">
                                                  <button
                                                    type="button"
                                                    className="btn-primary btn-sm"
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
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="btn-secondary btn-sm"
                                                    onClick={() => {
                                                      setEditingEntry(null);
                                                      void queryClient.invalidateQueries({
                                                        queryKey: ['report', teamId],
                                                      });
                                                    }}
                                                  >
                                                    Take Theirs
                                                  </button>
                                                </div>
                                              </div>
                                            )}

                                            <label className="field">
                                              <span>Status</span>
                                              <textarea
                                                rows={3}
                                                value={editingEntry.statusText}
                                                onChange={(e) =>
                                                  setEditingEntry({
                                                    ...editingEntry,
                                                    statusText: e.target.value,
                                                  })
                                                }
                                              />
                                            </label>

                                            <div className="field">
                                              <span>Task Completed By</span>
                                              <div className="member-pills">
                                                {activeMembers.map((m) => {
                                                  const selected =
                                                    editingEntry.completedByMemberId === m.id;
                                                  return (
                                                    <button
                                                      key={m.id}
                                                      type="button"
                                                      className={
                                                        selected ? 'pill pill-active' : 'pill'
                                                      }
                                                      onClick={() =>
                                                        setEditingEntry({
                                                          ...editingEntry,
                                                          completedByMemberId: m.id,
                                                          completedByLabel: null,
                                                        })
                                                      }
                                                    >
                                                      {m.displayName}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>

                                            <div className="entry-edit-actions">
                                              <button
                                                type="button"
                                                className="btn-primary btn-sm"
                                                disabled={updateEntryMutation.isPending}
                                                onClick={() =>
                                                  updateEntryMutation.mutate({
                                                    entryId: editingEntry.entryId,
                                                    statusText: editingEntry.statusText,
                                                    completedByMemberId:
                                                      editingEntry.completedByMemberId,
                                                    completedByLabel:
                                                      editingEntry.completedByLabel,
                                                    version: editingEntry.version,
                                                  })
                                                }
                                              >
                                                {updateEntryMutation.isPending
                                                  ? 'Saving...'
                                                  : 'Save'}
                                              </button>
                                              <button
                                                type="button"
                                                className="btn-secondary btn-sm"
                                                onClick={() => setEditingEntry(null)}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return (
                                    <tr key={entry.id}>
                                      <td className="inner-col-status">
                                        <div>
                                          {group.numberingMode === 'numbered' ? (
                                            <strong>{eIdx + 1}. </strong>
                                          ) : null}
                                          {entry.statusText}
                                        </div>
                                        {!isFinalized && (
                                          <div className="inline-entry-actions">
                                            <button
                                              type="button"
                                              className="btn-secondary btn-xs"
                                              disabled={
                                                eIdx === 0 || reorderEntriesMutation.isPending
                                              }
                                              onClick={() =>
                                                reorderEntriesMutation.mutate({
                                                  groupId: group.id,
                                                  ids: moveItem(group.entries, eIdx, -1).map(
                                                    (item) => item.id,
                                                  ),
                                                })
                                              }
                                            >
                                              ↑
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-secondary btn-xs"
                                              disabled={
                                                eIdx === group.entries.length - 1 ||
                                                reorderEntriesMutation.isPending
                                              }
                                              onClick={() =>
                                                reorderEntriesMutation.mutate({
                                                  groupId: group.id,
                                                  ids: moveItem(group.entries, eIdx, 1).map(
                                                    (item) => item.id,
                                                  ),
                                                })
                                              }
                                            >
                                              ↓
                                            </button>
                                            {editable && (
                                              <>
                                                <button
                                                  type="button"
                                                  className="btn-secondary btn-xs"
                                                  onClick={() => startEditEntry(entry)}
                                                >
                                                  Edit
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn-secondary btn-xs"
                                                  onClick={() =>
                                                    promoteFollowupMutation.mutate({
                                                      categoryName: group.categoryName,
                                                      titleName: group.titleName,
                                                      statusText: entry.statusText,
                                                      completedByMemberId:
                                                        entry.completedByMemberId,
                                                      completedByLabel: entry.completedByLabel,
                                                    })
                                                  }
                                                >
                                                  → Follow-up
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn-danger btn-xs"
                                                  onClick={() => {
                                                    if (window.confirm('Delete this work entry?')) {
                                                      deleteEntryMutation.mutate(entry.id);
                                                    }
                                                  }}
                                                >
                                                  Delete
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                      <td className="inner-col-by">{entry.completedByDisplay}</td>
                                    </tr>
                                  );
                                })}
                                {!isFinalized && (
                                  <tr>
                                    <td colSpan={2} className="table-add-footer">
                                      <button
                                        type="button"
                                        className="btn-secondary btn-xs"
                                        onClick={() =>
                                          setQuickAdd({
                                            groupId: group.id,
                                            categoryName: group.categoryName,
                                            titleName: group.titleName,
                                            statusText: '',
                                            completedByMemberIds: [session.member.id],
                                          })
                                        }
                                      >
                                        + Add Status to Ser {gIdx + 1}
                                      </button>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>

                      {isEditingThisGroup && editingGroup && (
                        <tr>
                          <td colSpan={5} className="followup-edit-cell">
                            <div className="entry-edit-box">
                              <div className="group-header">
                                <strong>Edit Category &amp; Title for Ser {gIdx + 1}</strong>
                              </div>
                              <div className="composer-grid">
                                <label className="field">
                                  <span>Report Category</span>
                                  <select
                                    value={editingGroup.categoryName}
                                    onChange={(e) => {
                                      const nextCatName = e.target.value;
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
                                    {!activeCategories.some(
                                      (c) => c.name === editingGroup.categoryName,
                                    ) && (
                                      <option value={editingGroup.categoryName}>
                                        {editingGroup.categoryName}
                                      </option>
                                    )}
                                    {activeCategories.map((c) => (
                                      <option key={c.id} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Title</span>
                                  <select
                                    value={editingGroup.titleName}
                                    onChange={(e) =>
                                      setEditingGroup({
                                        ...editingGroup,
                                        titleName: e.target.value,
                                      })
                                    }
                                  >
                                    {!editTitles.some(
                                      (t) => t.name === editingGroup.titleName,
                                    ) && (
                                      <option value={editingGroup.titleName}>
                                        {editingGroup.titleName}
                                      </option>
                                    )}
                                    {editTitles.map((t) => (
                                      <option key={t.id} value={t.name}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="entry-edit-actions">
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  disabled={updateGroupMutation.isPending}
                                  onClick={() => updateGroupMutation.mutate(editingGroup)}
                                >
                                  {updateGroupMutation.isPending ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => setEditingGroup(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {isQuickAdding && quickAdd && (
                        <tr>
                          <td colSpan={5} className="followup-edit-cell">
                            <div className="entry-edit-box">
                              <div className="group-header">
                                <strong>
                                  Add Status to Ser {gIdx + 1} ({group.categoryName} /{' '}
                                  {group.titleName})
                                </strong>
                              </div>
                              <label className="field">
                                <span>Status</span>
                                <textarea
                                  rows={2}
                                  value={quickAdd.statusText}
                                  onChange={(e) =>
                                    setQuickAdd({ ...quickAdd, statusText: e.target.value })
                                  }
                                  placeholder="Enter status..."
                                />
                              </label>
                              <div className="field">
                                <span>Task Completed By</span>
                                <div className="member-pills">
                                  {activeMembers.map((m) => {
                                    const selected = quickAdd.completedByMemberIds.includes(m.id);
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        className={selected ? 'pill pill-active' : 'pill'}
                                        onClick={() => {
                                          const exists =
                                            quickAdd.completedByMemberIds.includes(m.id);
                                          const next = exists
                                            ? quickAdd.completedByMemberIds.length > 1
                                              ? quickAdd.completedByMemberIds.filter(
                                                  (id) => id !== m.id,
                                                )
                                              : quickAdd.completedByMemberIds
                                            : [...quickAdd.completedByMemberIds, m.id];
                                          setQuickAdd({
                                            ...quickAdd,
                                            completedByMemberIds: next,
                                          });
                                        }}
                                      >
                                        {m.displayName}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="entry-edit-actions">
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  disabled={
                                    quickAddMutation.isPending || !quickAdd.statusText.trim()
                                  }
                                  onClick={() => quickAddMutation.mutate(quickAdd)}
                                >
                                  {quickAddMutation.isPending ? 'Adding...' : 'Add Status'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => setQuickAdd(null)}
                                >
                                  Cancel
                                </button>
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
        </div>

        <div className="preview-section">
          <div className="section-heading">
            <h2>
              {isFinalized
                ? 'Finalized Report Preview (Full Team)'
                : `Live Preview (${session.member.displayName}'s Entries)`}
            </h2>
            {!isFinalized && (
              <span className="muted">
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
      </div>
    </div>
  );
}
