import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DictionaryCategory, MemberSummary } from '@cghq/contracts';
import { findUnsupportedLatinChars } from '@cghq/document/date';
import { Plus } from 'lucide-react';
import { ApiError, reportsApi } from '../api/client.js';
import { Alert } from './ui/alert.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Label } from './ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Textarea } from './ui/textarea.js';

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

  const activeMembers = useMemo(() => members.filter((m) => m.isActive), [members]);

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

  const [categoryName, setCategoryName] = useState('');
  const [titleName, setTitleName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberIds, setCompletedByMemberIds] = useState<string[]>([currentMemberId]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  useEffect(() => {
    if (activeCategories.length === 0) return;
    const matchedCat =
      activeCategories.find((c) => c.name === categoryName) ?? activeCategories[0]!;
    if (matchedCat.name !== categoryName) {
      setCategoryName(matchedCat.name);
      setTitleName(matchedCat.titles[0]?.name ?? '');
      return;
    }
    const matchedTitle = matchedCat.titles.find((t) => t.name === titleName);
    if (!matchedTitle) {
      setTitleName(matchedCat.titles[0]?.name ?? '');
    }
  }, [activeCategories, categoryName, titleName]);

  useEffect(() => {
    if (!statusText) {
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

  const selectedCategory = useMemo(
    () => activeCategories.find((c) => c.name === categoryName) ?? activeCategories[0] ?? null,
    [activeCategories, categoryName],
  );

  const titleOptions = selectedCategory?.titles ?? [];

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
      setErrorMsg('Report Category, Title, and Status are required.');
      return;
    }
    createMutation.mutate();
  }

  return (
    <Card className="no-print border-t-2 border-t-primary">
      <form onSubmit={handleSubmit}>
        <CardHeader className="py-2.5">
          <div className="flex items-center gap-2.5">
            <CardTitle>Add Work Entry</CardTitle>
            {disabled && <Badge variant="secondary">Finalized (read-only)</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Task Completed By:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {activeMembers.map((m) => {
                const selected = completedByMemberIds.includes(m.id);
                return (
                  <Button
                    key={m.id}
                    type="button"
                    size="xs"
                    variant={selected ? 'dark' : 'outline'}
                    onClick={() => toggleMember(m.id)}
                    disabled={disabled || createMutation.isPending}
                  >
                    {m.displayName}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 pt-3">
          {errorMsg && <Alert variant="destructive">{errorMsg}</Alert>}
          {unsupportedChars.length > 0 && (
            <Alert variant="warning">
              Unsupported non-Latin characters detected ({unsupportedChars.join(' ')}). PDF export
              only supports Latin script (FR-20).
            </Alert>
          )}

          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.3fr_2.2fr_auto]">
            <div className="grid gap-1.5">
              <Label>Report Category</Label>
              <Select
                value={categoryName}
                onValueChange={(nextCatName) => {
                  setCategoryName(nextCatName);
                  const nextCat = activeCategories.find((c) => c.name === nextCatName);
                  setTitleName(nextCat?.titles[0]?.name ?? '');
                }}
                disabled={disabled || createMutation.isPending || activeCategories.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Select
                value={titleName}
                onValueChange={setTitleName}
                disabled={disabled || createMutation.isPending || titleOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select title" />
                </SelectTrigger>
                <SelectContent>
                  {titleOptions.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5 md:col-span-2 lg:col-span-1">
              <Label htmlFor="composer-status">Status (one line per item)</Label>
              <Textarea
                id="composer-status"
                rows={1}
                className="h-9 min-h-[36px] resize-y py-1.5"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Describe completed work or current status..."
                disabled={disabled || createMutation.isPending}
                required
              />
            </div>

            <Button
              type="submit"
              className="h-9 px-4 md:col-span-2 lg:col-span-1"
              disabled={disabled || createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Saving...' : 'Add Entry'}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
