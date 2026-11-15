import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthSession,
  DailyReportDto,
  WorkEntryDto,
} from '@cghq/contracts';
import {
  ApiError,
  dictionaryApi,
  reportsApi,
  teamsApi,
} from '../api/client.js';
import { EntryComposer } from '../components/EntryComposer.js';
import { ReportPreview } from '../components/ReportPreview.js';

interface ReportScreenProps {
  session: AuthSession;
}

interface EditingState {
  entryId: string;
  statusText: string;
  completedByMemberId: string | null;
  completedByLabel: string | null;
  version: number;
  conflictCurrent: WorkEntryDto | null;
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

  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);

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

  const report = reportQuery.data;
  const activeDate = routeDate ?? report?.reportDate ?? '';
  const isFinalized = report?.status === 'finalized';
  const showNewDayBanner = Boolean(report && report.todayDate !== report.reportDate);

  function syncReportCache(updated: DailyReportDto) {
    queryClient.setQueryData(['report', teamId, updated.reportDate], updated);
    if (!routeDate) {
      queryClient.setQueryData(['report', teamId, 'today'], updated);
    }
    void queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
  }

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
    onSuccess: (updated) => {
      setActionError(null);
      setEditing(null);
      syncReportCache(updated);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        const current = (err.payload?.current as WorkEntryDto | undefined) ?? null;
        setEditing((prev) => (prev ? { ...prev, conflictCurrent: current } : prev));
        return;
      }
      setActionError(err instanceof ApiError ? err.message : 'Failed to update entry');
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => reportsApi.deleteEntry(teamId, activeDate, entryId),
    onSuccess: (updated) => {
      setActionError(null);
      syncReportCache(updated);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete entry');
    },
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: (ids: string[]) => reportsApi.reorderGroups(teamId, activeDate, { ids }),
    onSuccess: (updated) => {
      setActionError(null);
      syncReportCache(updated);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to reorder groups');
    },
  });

  const reorderEntriesMutation = useMutation({
    mutationFn: ({ groupId, ids }: { groupId: string; ids: string[] }) =>
      reportsApi.reorderEntries(teamId, activeDate, groupId, { ids }),
    onSuccess: (updated) => {
      setActionError(null);
      syncReportCache(updated);
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
    onSuccess: (updated) => {
      setActionError(null);
      syncReportCache(updated);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Failed to change numbering');
    },
  });

  function startEdit(entry: WorkEntryDto) {
    setActionError(null);
    setEditing({
      entryId: entry.id,
      statusText: entry.statusText,
      completedByMemberId: entry.completedByMemberId,
      completedByLabel: entry.completedByLabel,
      version: entry.version,
      conflictCurrent: null,
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

        <div className="view-toggle" role="tablist" aria-label="Report view mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'edit'}
            className={viewMode === 'edit' ? 'tab-btn tab-btn-active' : 'tab-btn'}
            onClick={() => setViewMode('edit')}
          >
            Edit Entries
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'preview'}
            className={viewMode === 'preview' ? 'tab-btn tab-btn-active' : 'tab-btn'}
            onClick={() => setViewMode('preview')}
          >
            Live Preview
          </button>
        </div>
      </div>

      {actionError && <div className="alert-error">{actionError}</div>}

      {viewMode === 'preview' ? (
        <ReportPreview
          report={report}
          documentTitle={session.team.documentTitle}
          hasLogo={session.team.hasLogo}
        />
      ) : (
        <div className="report-workspace">
          <EntryComposer
            teamId={teamId}
            reportDate={report.reportDate}
            dictionary={dictionaryQuery.data ?? []}
            members={membersQuery.data ?? []}
            currentMemberId={session.member.id}
            disabled={isFinalized}
          />

          <div className="groups-section">
            <div className="section-heading">
              <h2>Work Groups ({report.groups.length})</h2>
              <span className="muted">Auto-refreshes every 15s</span>
            </div>

            {report.groups.length === 0 ? (
              <div className="card">
                <p className="muted">
                  No work entries yet for {report.reportDate}. Use the composer above to add the
                  first entry.
                </p>
              </div>
            ) : (
              report.groups.map((group, gIdx) => (
                <div key={group.id} className="card group-card">
                  <div className="group-header">
                    <div>
                      <span className="group-ser">Ser {gIdx + 1}</span>
                      <strong className="group-category">{group.categoryName}</strong>
                      <span className="group-sep">/</span>
                      <span className="group-title">{group.titleName}</span>
                    </div>

                    {!isFinalized && (
                      <div className="group-controls">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          title="Toggle numbered vs plain status lines"
                          onClick={() =>
                            toggleNumberingMutation.mutate({
                              groupId: group.id,
                              numberingMode:
                                group.numberingMode === 'numbered' ? 'plain' : 'numbered',
                            })
                          }
                          disabled={toggleNumberingMutation.isPending}
                        >
                          {group.numberingMode === 'numbered' ? '1. 2. 3.' : 'Plain'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={gIdx === 0 || reorderGroupsMutation.isPending}
                          onClick={() => {
                            const next = moveItem(report.groups, gIdx, -1).map((g) => g.id);
                            reorderGroupsMutation.mutate(next);
                          }}
                        >
                          ↑ Group
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={
                            gIdx === report.groups.length - 1 || reorderGroupsMutation.isPending
                          }
                          onClick={() => {
                            const next = moveItem(report.groups, gIdx, 1).map((g) => g.id);
                            reorderGroupsMutation.mutate(next);
                          }}
                        >
                          ↓ Group
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="entries-list">
                    {group.entries.map((entry, eIdx) => {
                      const isEditingThis = editing?.entryId === entry.id;
                      const editable = canMutateEntry(entry);

                      if (isEditingThis && editing) {
                        return (
                          <div key={entry.id} className="entry-edit-box">
                            {editing.conflictCurrent && (
                              <div className="alert-warn conflict-box">
                                <div>
                                  <strong>Edit conflict (FR-32):</strong> Another team member
                                  updated this entry while you were editing.
                                  <div className="conflict-theirs">
                                    <em>Their saved version:</em> &ldquo;
                                    {editing.conflictCurrent.statusText}&rdquo; (by{' '}
                                    {editing.conflictCurrent.completedByDisplay})
                                  </div>
                                </div>
                                <div className="conflict-actions">
                                  <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    onClick={() =>
                                      updateEntryMutation.mutate({
                                        entryId: editing.entryId,
                                        statusText: editing.statusText,
                                        completedByMemberId: editing.completedByMemberId,
                                        completedByLabel: editing.completedByLabel,
                                        version: editing.conflictCurrent!.version,
                                      })
                                    }
                                  >
                                    Keep Mine
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() => {
                                      setEditing(null);
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
                                value={editing.statusText}
                                onChange={(e) =>
                                  setEditing({ ...editing, statusText: e.target.value })
                                }
                              />
                            </label>

                            <div className="field">
                              <span>Task Completed By</span>
                              <div className="member-pills">
                                {activeMembers.map((m) => {
                                  const selected = editing.completedByMemberId === m.id;
                                  return (
                                    <button
                                      key={m.id}
                                      type="button"
                                      className={selected ? 'pill pill-active' : 'pill'}
                                      onClick={() =>
                                        setEditing({
                                          ...editing,
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
                                    entryId: editing.entryId,
                                    statusText: editing.statusText,
                                    completedByMemberId: editing.completedByMemberId,
                                    completedByLabel: editing.completedByLabel,
                                    version: editing.version,
                                  })
                                }
                              >
                                {updateEntryMutation.isPending ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => setEditing(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={entry.id} className="entry-row">
                          <div className="entry-body">
                            <div className="entry-status">
                              {group.numberingMode === 'numbered' ? (
                                <span className="entry-num">{eIdx + 1}. </span>
                              ) : null}
                              {entry.statusText}
                            </div>
                            <div className="entry-meta">
                              Completed by: <strong>{entry.completedByDisplay}</strong>
                            </div>
                          </div>

                          {!isFinalized && (
                            <div className="entry-actions">
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                disabled={eIdx === 0 || reorderEntriesMutation.isPending}
                                onClick={() => {
                                  const ids = moveItem(group.entries, eIdx, -1).map(
                                    (item) => item.id,
                                  );
                                  reorderEntriesMutation.mutate({
                                    groupId: group.id,
                                    ids,
                                  });
                                }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                disabled={
                                  eIdx === group.entries.length - 1 ||
                                  reorderEntriesMutation.isPending
                                }
                                onClick={() => {
                                  const ids = moveItem(group.entries, eIdx, 1).map(
                                    (item) => item.id,
                                  );
                                  reorderEntriesMutation.mutate({
                                    groupId: group.id,
                                    ids,
                                  });
                                }}
                              >
                                ↓
                              </button>
                              {editable && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() => startEdit(entry)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-danger btn-sm"
                                    disabled={deleteEntryMutation.isPending}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
