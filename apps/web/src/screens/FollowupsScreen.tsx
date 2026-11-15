import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession, FollowupItemDto, FollowupStatus } from '@cghq/contracts';
import { ApiError, followupsApi, teamsApi } from '../api/client.js';

interface FollowupsScreenProps {
  session: AuthSession;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  const [removed] = copy.splice(index, 1);
  copy.splice(target, 0, removed!);
  return copy;
}

export function FollowupsScreen({ session }: FollowupsScreenProps) {
  const queryClient = useQueryClient();
  const teamId = session.team.id;

  const [includeArchived, setIncludeArchived] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [titleName, setTitleName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberId, setCompletedByMemberId] = useState<string>('');
  const [completedByLabel, setCompletedByLabel] = useState('As Previous');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const followupsQuery = useQuery({
    queryKey: ['followups', teamId, includeArchived],
    queryFn: () => followupsApi.list(teamId, includeArchived),
  });

  const membersQuery = useQuery({
    queryKey: ['members', teamId],
    queryFn: () => teamsApi.listMembers(teamId),
  });

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
      setCategoryName('');
      setTitleName('');
      setStatusText('');
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to create follow-up');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ item, status }: { item: FollowupItemDto; status: FollowupStatus }) =>
      followupsApi.update(teamId, item.id, { status, version: item.version }),
    onSuccess: () => {
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to update follow-up');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => followupsApi.reorder(teamId, { ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['followups', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
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
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span>Show archived</span>
          </label>
        </div>
        <p className="muted">
          Open and in-progress items automatically carry forward into every draft daily report
          until marked done or archived.
        </p>
      </div>

      <form className="card composer-card" onSubmit={handleCreate}>
        <h3>Add Follow-up Item</h3>
        {errorMsg && <div className="alert-error">{errorMsg}</div>}

        <div className="composer-grid">
          <label className="field">
            <span>Report Category (optional)</span>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g. Operations"
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={titleName}
              onChange={(e) => setTitleName(e.target.value)}
              placeholder="e.g. SSL Certificate Renewal"
              required
            />
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
            <span>Assigned Member (optional)</span>
            <select
              value={completedByMemberId}
              onChange={(e) => setCompletedByMemberId(e.target.value)}
            >
              <option value="">Use Label (default: As Previous)</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>

          {!completedByMemberId && (
            <label className="field">
              <span>Task Completed By Label</span>
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

      <div className="card">
        {followupsQuery.isLoading ? (
          <p className="muted">Loading follow-ups...</p>
        ) : items.length === 0 ? (
          <p className="muted">No follow-up items yet. Daily reports will show &ldquo;None&rdquo;.</p>
        ) : (
          <div className="entries-list">
            {items.map((item, idx) => (
              <div key={item.id} className="entry-row">
                <div className="entry-body">
                  <div className="followup-title-line">
                    <span className={`badge badge-followup-${item.status}`}>{item.status}</span>
                    {item.categoryName && (
                      <span className="muted">{item.categoryName} / </span>
                    )}
                    <strong>{item.titleName}</strong>
                  </div>
                  <div className="entry-status">{item.statusText}</div>
                  <div className="entry-meta">
                    Completed by: <strong>{item.completedByDisplay}</strong>
                    {item.completedOn ? ` · Completed on ${item.completedOn}` : ''}
                  </div>
                </div>

                {item.status !== 'archived' && (
                  <div className="entry-actions">
                    <select
                      aria-label="Follow-up status"
                      value={item.status}
                      onChange={(e) =>
                        updateStatusMutation.mutate({
                          item,
                          status: e.target.value as FollowupStatus,
                        })
                      }
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={idx === 0 || reorderMutation.isPending}
                      onClick={() =>
                        reorderMutation.mutate(moveItem(items, idx, -1).map((x) => x.id))
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={idx === items.length - 1 || reorderMutation.isPending}
                      onClick={() =>
                        reorderMutation.mutate(moveItem(items, idx, 1).map((x) => x.id))
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={() => {
                        if (window.confirm('Archive this follow-up item?')) {
                          archiveMutation.mutate(item.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
