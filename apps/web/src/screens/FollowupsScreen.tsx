import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession, FollowupItemDto, FollowupStatus } from '@cghq/contracts';
import { ApiError, dictionaryApi, followupsApi, teamsApi } from '../api/client.js';

interface FollowupsScreenProps {
  session: AuthSession;
}

interface EditRowState {
  id: string;
  categoryName: string;
  titleName: string;
  status: FollowupStatus;
  statusText: string;
  completedByMemberId: string;
  completedByLabel: string;
  version: number;
}

export function FollowupsScreen({ session }: FollowupsScreenProps) {
  const queryClient = useQueryClient();
  const teamId = session.team.id;

  const [includeArchived, setIncludeArchived] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [titleName, setTitleName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberId, setCompletedByMemberId] = useState<string>('');
  const [completedByLabel, setCompletedByLabel] = useState('As Previous');
  const [editing, setEditing] = useState<EditRowState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const followupsQuery = useQuery({
    queryKey: ['followups', teamId, includeArchived],
    queryFn: () => followupsApi.list(teamId, includeArchived),
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

  // Default dropdown selections when dictionary loads
  useEffect(() => {
    if (activeCategories.length === 0) return;
    if (!categoryName || !activeCategories.some((c) => c.name === categoryName)) {
      const firstCat = activeCategories[0]!;
      setCategoryName(firstCat.name);
      setTitleName(firstCat.titles[0]?.name ?? '');
    }
  }, [activeCategories, categoryName]);

  const titleOptions = useMemo(() => {
    const cat = activeCategories.find((c) => c.name === categoryName);
    return cat?.titles ?? [];
  }, [activeCategories, categoryName]);

  const createMutation = useMutation({
    mutationFn: () =>
      followupsApi.create(teamId, {
        categoryName: categoryName.trim(),
        titleName: titleName.trim(),
        statusText: statusText.trim(),
        completedByMemberId: completedByMemberId || null,
        completedByLabel: completedByMemberId ? null : completedByLabel.trim() || 'As Previous',
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setStatusText('');
      setShowAddForm(false);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to create follow-up');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: EditRowState) =>
      followupsApi.update(teamId, payload.id, {
        categoryName: payload.categoryName.trim(),
        titleName: payload.titleName.trim(),
        status: payload.status,
        statusText: payload.statusText.trim(),
        completedByMemberId: payload.completedByMemberId || null,
        completedByLabel: payload.completedByMemberId
          ? null
          : payload.completedByLabel.trim() || 'As Previous',
        version: payload.version,
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to update follow-up');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => followupsApi.archive(teamId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
  });

  const activeMembers = (membersQuery.data ?? []).filter((m) => m.isActive);
  const items = followupsQuery.data ?? [];

  function startEdit(item: FollowupItemDto) {
    setErrorMsg(null);
    setEditing({
      id: item.id,
      categoryName: item.categoryName,
      titleName: item.titleName,
      status: item.status,
      statusText: item.statusText,
      completedByMemberId: item.completedByMemberId ?? '',
      completedByLabel: item.completedByLabel ?? 'As Previous',
      version: item.version,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!titleName.trim() || !statusText.trim()) {
      setErrorMsg('Title and Status are required.');
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="report-page">
      <div className="card">
        <div className="section-heading">
          <h2>Follow-up Items</h2>
          <div className="toolbar-actions">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              <span>Show archived</span>
            </label>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setShowAddForm((v) => !v)}
            >
              {showAddForm ? 'Close Form' : '+ Add New Follow-up'}
            </button>
          </div>
        </div>
        <p className="muted">
          Default follow-up items stay active and carry forward into your final report
          automatically unless edited or deleted.
        </p>
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}

      {showAddForm && (
        <form className="card composer-card" onSubmit={handleCreate}>
          <h3>Add New Follow-up Item</h3>

          <div className="composer-grid">
            <label className="field">
              <span>Report Category</span>
              <select
                value={categoryName}
                onChange={(e) => {
                  const nextCatName = e.target.value;
                  setCategoryName(nextCatName);
                  const nextCat = activeCategories.find((c) => c.name === nextCatName);
                  setTitleName(nextCat?.titles[0]?.name ?? '');
                }}
              >
                {activeCategories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Title</span>
              <select value={titleName} onChange={(e) => setTitleName(e.target.value)}>
                {titleOptions.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Status</span>
            <textarea
              rows={2}
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="Describe pending follow-up action..."
              required
            />
          </label>

          <div className="composer-grid">
            <label className="field">
              <span>Task Completed By</span>
              <select
                value={completedByMemberId}
                onChange={(e) => setCompletedByMemberId(e.target.value)}
              >
                <option value="">As Previous (or custom label)</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>

            {!completedByMemberId && (
              <label className="field">
                <span>Custom Label</span>
                <input
                  type="text"
                  value={completedByLabel}
                  onChange={(e) => setCompletedByLabel(e.target.value)}
                  placeholder="As Previous"
                />
              </label>
            )}
          </div>

          <div className="composer-actions">
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Follow-up'}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        {followupsQuery.isLoading ? (
          <p className="muted">Loading follow-ups...</p>
        ) : items.length === 0 ? (
          <p className="muted">
            No follow-up items. Finalized reports will display &ldquo;None&rdquo;.
          </p>
        ) : (
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th className="col-ser">Ser</th>
                  <th className="col-cat">Report Category</th>
                  <th className="col-title">Title</th>
                  <th className="col-status">Status</th>
                  <th className="col-by">Task Completed By</th>
                  <th style={{ width: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isEditingThis = editing?.id === item.id;
                  if (isEditingThis && editing) {
                    const editCat = activeCategories.find(
                      (c) => c.name === editing.categoryName,
                    );
                    const editTitles = editCat?.titles ?? [];
                    return (
                      <tr key={item.id}>
                        <td className="col-ser">{idx + 1}</td>
                        <td>
                          <select
                            value={editing.categoryName}
                            onChange={(e) => {
                              const nextCatName = e.target.value;
                              const nextCat = activeCategories.find(
                                (c) => c.name === nextCatName,
                              );
                              setEditing({
                                ...editing,
                                categoryName: nextCatName,
                                titleName: nextCat?.titles[0]?.name ?? editing.titleName,
                              });
                            }}
                          >
                            {!activeCategories.some((c) => c.name === editing.categoryName) && (
                              <option value={editing.categoryName}>
                                {editing.categoryName || 'General'}
                              </option>
                            )}
                            {activeCategories.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={editing.titleName}
                            onChange={(e) =>
                              setEditing({ ...editing, titleName: e.target.value })
                            }
                          >
                            {!editTitles.some((t) => t.name === editing.titleName) && (
                              <option value={editing.titleName}>{editing.titleName}</option>
                            )}
                            {editTitles.map((t) => (
                              <option key={t.id} value={t.name}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <textarea
                            rows={3}
                            style={{ width: '100%' }}
                            value={editing.statusText}
                            onChange={(e) =>
                              setEditing({ ...editing, statusText: e.target.value })
                            }
                          />
                          <select
                            style={{ marginTop: 4 }}
                            value={editing.status}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                status: e.target.value as FollowupStatus,
                              })
                            }
                          >
                            <option value="open">Open (carry forward)</option>
                            <option value="in_progress">In Progress (carry forward)</option>
                            <option value="done">Done (stop carrying forward)</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={editing.completedByMemberId}
                            onChange={(e) =>
                              setEditing({ ...editing, completedByMemberId: e.target.value })
                            }
                          >
                            <option value="">Label ({editing.completedByLabel})</option>
                            {activeMembers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.displayName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="history-actions">
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate(editing)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={item.id}>
                      <td className="col-ser">{idx + 1}</td>
                      <td>{item.categoryName}</td>
                      <td>{item.titleName}</td>
                      <td>
                        <div>{item.statusText}</div>
                        <span
                          className={`badge badge-followup-${item.status}`}
                          style={{ marginTop: 4 }}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>{item.completedByDisplay}</td>
                      <td>
                        {item.status !== 'archived' && (
                          <div className="history-actions">
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => startEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-danger btn-sm"
                              onClick={() => {
                                if (window.confirm('Delete this follow-up item?')) {
                                  archiveMutation.mutate(item.id);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
