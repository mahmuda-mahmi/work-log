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

interface TableSectionOption {
  categoryName: string;
  titleName: string;
}

interface EntryComposerProps {
  teamId: string;
  reportDate: string;
  dictionary: DictionaryCategory[];
  members: MemberSummary[];
  currentMemberId: string;
  tableSections?: TableSectionOption[];
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
  tableSections = [],
  disabled = false,
}: EntryComposerProps) {
  const queryClient = useQueryClient();
  const draftKey = `cghq:draft:${teamId}:${reportDate}`;
  const lastPairKey = `cghq:lastPair:${teamId}`;

  const activeMembers = useMemo(() => members.filter((m) => m.isActive), [members]);

  const activeCategories = useMemo(() => {
    const merged = dictionary
      .filter((c) => c.isActive)
      .map((c) => ({
        ...c,
        titles: c.titles.filter((t) => t.isActive),
      }))
      .filter((c) => c.titles.length > 0);

    for (const sec of tableSections) {
      const catName = sec.categoryName.trim();
      const titleName = sec.titleName.trim();
      if (!catName || !titleName) continue;

      let existingCat = merged.find((c) => c.name === catName);
      if (!existingCat) {
        existingCat = {
          id: `section:${catName}`,
          name: catName,
          position: 0,
          isActive: true,
          titles: [],
        };
        merged.push(existingCat);
      }
      if (!existingCat.titles.some((t) => t.name === titleName)) {
        existingCat.titles.push({
          id: `section-title:${catName}:${titleName}`,
          categoryId: existingCat.id,
          name: titleName,
          position: 0,
          isActive: true,
        });
      }
    }

    const sectionOrder = new Map<string, number>();
    tableSections.forEach((sec, idx) => {
      if (!sectionOrder.has(sec.categoryName.trim())) {
        sectionOrder.set(sec.categoryName.trim(), idx);
      }
    });

    return merged.sort((a, b) => {
      const aOrd = sectionOrder.get(a.name);
      const bOrd = sectionOrder.get(b.name);
      if (aOrd !== undefined && bOrd !== undefined) return aOrd - bOrd;
      if (aOrd !== undefined) return -1;
      if (bOrd !== undefined) return 1;
      return 0;
    });
  }, [dictionary, tableSections]);

  const [categoryName, setCategoryName] = useState('');
  const [titleName, setTitleName] = useState('');
  const [communicationType, setCommunicationType] = useState<string>('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberIds, setCompletedByMemberIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCommunication = categoryName.trim().toLowerCase() === 'communication';

  useEffect(() => {
    const savedDraft = readJsonStorage<StoredDraft>(draftKey);
    if (savedDraft) {
      setCategoryName(savedDraft.categoryName ?? '');
      setTitleName(savedDraft.titleName ?? '');
      setStatusText(savedDraft.statusText ?? '');
      setCompletedByMemberIds(savedDraft.completedByMemberIds ?? []);
      return;
    }

    const lastPair = readJsonStorage<{ categoryName: string; titleName: string }>(lastPairKey);
    setCategoryName(lastPair?.categoryName ?? '');
    setTitleName(lastPair?.titleName ?? '');
    setStatusText('');
    setCompletedByMemberIds([]);
  }, [draftKey, lastPairKey]);

  useEffect(() => {
    if (activeCategories.length === 0) return;
    const defaultCategory =
      activeCategories.find((c) => c.name.trim().toLowerCase() === 'support') ??
      activeCategories[0]!;

    const matchedCat = activeCategories.find((c) => c.name === categoryName);
    if (!matchedCat) {
      setCategoryName(defaultCategory.name);
      setTitleName(defaultCategory.titles[0]?.name ?? '');
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
      const trimmedStatus = statusText.trim();
      const formattedStatus =
        isCommunication && communicationType && trimmedStatus
          ? `${communicationType}: ${trimmedStatus}`
          : trimmedStatus;
      return reportsApi.createEntry(teamId, reportDate, {
        categoryName: categoryName.trim(),
        titleName: titleName.trim(),
        statusLines: formattedStatus ? [formattedStatus] : [],
        completedByMemberIds,
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      writeJsonStorage(lastPairKey, {
        categoryName: categoryName.trim(),
        titleName: titleName.trim(),
      });
      setCommunicationType('');
      setStatusText('');
      setCompletedByMemberIds([]);
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
    setCompletedByMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
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
            <span className="text-xs font-semibold text-zinc-500">
              Task Completed By (optional):
            </span>
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
                  if (nextCatName.trim().toLowerCase() !== 'communication') {
                    setCommunicationType('');
                  }
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
              <Label htmlFor="composer-status">Status</Label>
              <div className={isCommunication ? 'flex items-start gap-2' : 'grid'}>
                {isCommunication && (
                  <Select
                    className="w-[125px] shrink-0"
                    value={communicationType}
                    onValueChange={setCommunicationType}
                    disabled={disabled || createMutation.isPending}
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
                  id="composer-status"
                  rows={1}
                  className="h-9 min-h-[36px] min-w-0 flex-1 resize-y py-1.5"
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder={
                    isCommunication
                      ? 'Write details beside Sailor / Officer...'
                      : 'Describe completed work or current status...'
                  }
                  disabled={disabled || createMutation.isPending}
                  required
                />
              </div>
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
