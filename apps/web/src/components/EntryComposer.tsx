import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DictionaryCategory, MemberSummary } from '@cghq/contracts';
import { findUnsupportedLatinChars } from '@cghq/document/date';
import { ApiError, reportsApi } from '../api/client.js';

interface EntryComposerProps {
  teamId: string;
  reportDate: string;
  dictionary: DictionaryCategory[];
  members: MemberSummary[];
  currentMemberId: string;
  disabled?: boolean;
}

interface StoredDraft {
  categoryName: string;
  titleName: string;
  statusText: string;
  completedByMemberIds: string[];
}

function readJsonStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function EntryComposer({
  teamId,
  reportDate,
  dictionary,
  members,
  currentMemberId,
  disabled = false,
}: EntryComposerProps) {
  const queryClient = useQueryClient();
  const draftKey = `cghq:draft:${teamId}:${reportDate}`;
  const lastPairKey = `cghq:lastPair:${teamId}`;

  const activeMembers = useMemo(
    () => members.filter((m) => m.isActive),
    [members],
  );

  const [categoryName, setCategoryName] = useState('');
  const [titleName, setTitleName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberIds, setCompletedByMemberIds] = useState<string[]>([
    currentMemberId,
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Restore draft for this date, or fall back to last-used category/title
  useEffect(() => {
    const savedDraft = readJsonStorage<StoredDraft>(draftKey);
    if (savedDraft) {
      setCategoryName(savedDraft.categoryName ?? '');
      setTitleName(savedDraft.titleName ?? '');
      setStatusText(savedDraft.statusText ?? '');
      setCompletedByMemberIds(
        savedDraft.completedByMemberIds?.length
          ? savedDraft.completedByMemberIds
          : [currentMemberId],
      );
      return;
    }

    const lastPair = readJsonStorage<{ categoryName: string; titleName: string }>(lastPairKey);
    setCategoryName(lastPair?.categoryName ?? '');
    setTitleName(lastPair?.titleName ?? '');
    setStatusText('');
    setCompletedByMemberIds([currentMemberId]);
  }, [draftKey, lastPairKey, currentMemberId]);

  // Persist unsaved draft locally so navigation or refresh never loses typing (FR-30)
  useEffect(() => {
    if (!categoryName && !titleName && !statusText) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Ignore
      }
      return;
    }
    writeJsonStorage(draftKey, {
      categoryName,
      titleName,
      statusText,
      completedByMemberIds,
    } satisfies StoredDraft);
  }, [draftKey, categoryName, titleName, statusText, completedByMemberIds]);

  const matchingCategory = useMemo(() => {
    const needle = categoryName.trim().toLowerCase();
    return dictionary.find((c) => c.name.toLowerCase() === needle) ?? null;
  }, [dictionary, categoryName]);

  const titleSuggestions = useMemo(() => {
    if (matchingCategory) {
      return matchingCategory.titles;
    }
    return dictionary.flatMap((c) => c.titles);
  }, [dictionary, matchingCategory]);

  const unsupportedChars = useMemo(
    () => findUnsupportedLatinChars(`${categoryName}\n${titleName}\n${statusText}`),
    [categoryName, titleName, statusText],
  );

  const createMutation = useMutation({
    mutationFn: () => {
      const statusLines = statusText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      return reportsApi.createEntry(teamId, reportDate, {
        categoryName: categoryName.trim(),
        titleName: titleName.trim(),
        statusLines,
        completedByMemberIds: completedByMemberIds.length
          ? completedByMemberIds
          : [currentMemberId],
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      writeJsonStorage(lastPairKey, {
        categoryName: categoryName.trim(),
        titleName: titleName.trim(),
      });
      setStatusText('');
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Ignore
      }
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to add entry');
    },
  });

  function toggleMember(memberId: string) {
    setCompletedByMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.length > 1 ? prev.filter((id) => id !== memberId) : prev;
      }
      return [...prev, memberId];
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!categoryName.trim() || !titleName.trim() || !statusText.trim()) {
      setErrorMsg('Category, Title, and Status are required.');
      return;
    }
    createMutation.mutate();
  }

  return (
    <form className="card composer-card" onSubmit={handleSubmit}>
      <div className="composer-header">
        <h2>Add Work Entry</h2>
        {disabled && <span className="badge badge-muted">Finalized (read-only)</span>}
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}
      {unsupportedChars.length > 0 && (
        <div className="alert-warn">
          Unsupported non-Latin characters detected ({unsupportedChars.join(' ')}). PDF export
          only supports Latin script (FR-20).
        </div>
      )}

      <div className="composer-grid">
        <label className="field">
          <span>Report Category</span>
          <input
            type="text"
            list="cghq-category-options"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="e.g. Ops / Development / Support"
            disabled={disabled || createMutation.isPending}
            required
          />
          <datalist id="cghq-category-options">
            {dictionary.map((cat) => (
              <option key={cat.id} value={cat.name} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Title</span>
          <input
            type="text"
            list="cghq-title-options"
            value={titleName}
            onChange={(e) => setTitleName(e.target.value)}
            placeholder="e.g. API Hardening"
            disabled={disabled || createMutation.isPending}
            required
          />
          <datalist id="cghq-title-options">
            {titleSuggestions.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="field">
        <span>Status</span>
        <textarea
          rows={3}
          value={statusText}
          onChange={(e) => setStatusText(e.target.value)}
          placeholder="Describe completed work or current status..."
          disabled={disabled || createMutation.isPending}
          required
        />
      </label>

      <div className="field">
        <span>Task Completed By</span>
        <div className="member-pills">
          {activeMembers.map((m) => {
            const selected = completedByMemberIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={selected ? 'pill pill-active' : 'pill'}
                onClick={() => toggleMember(m.id)}
                disabled={disabled || createMutation.isPending}
              >
                {m.displayName}
              </button>
            );
          })}
        </div>
      </div>

      <div className="composer-actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={disabled || createMutation.isPending}
        >
          {createMutation.isPending ? 'Saving...' : 'Add Entry'}
        </button>
      </div>
    </form>
  );
}
