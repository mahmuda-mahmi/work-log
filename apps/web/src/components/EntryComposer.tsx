import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyReportDto, DictionaryCategory, MemberSummary, WorkEntryDto } from '@cghq/contracts';
import { isNilCommunicationStatus } from '@cghq/document/model';
import { findUnsupportedLatinChars } from '@cghq/document/date';
import { List, Plus } from 'lucide-react';
import { ApiError, frequentStatusesApi, reportsApi } from '../api/client.js';
import { appendStatusSuggestion, StatusSuggestionChips } from './StatusSuggestions.js';
import { Alert } from './ui/alert.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
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
  currentMemberId,
  tableSections = [],
  disabled = false,
}: EntryComposerProps) {
  const queryClient = useQueryClient();
  const { data: frequentStatuses = [] } = useQuery({
    queryKey: ['frequent-statuses', teamId],
    queryFn: () => frequentStatusesApi.list(teamId),
  });
  const [statusFocused, setStatusFocused] = useState(false);
  const draftKey = `cghq:draft:${teamId}:${reportDate}`;
  const lastPairKey = `cghq:lastPair:${teamId}`;

  const activeMembers = useMemo(() => members.filter((m) => m.isActive), [members]);

  const activeCategories = useMemo(() => {
    const merged = dictionary
      .filter((c) => c.isActive)
      .map((c) => ({
        ...c,
        titles: c.titles.filter((t) => t.isActive && t.scope !== 'followup'),
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
          scope: 'daily',
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
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomTitle, setIsCustomTitle] = useState(false);
  const [communicationType, setCommunicationType] = useState<string>('');
  const [statusText, setStatusText] = useState('');
  const [completedByMemberIds, setCompletedByMemberIds] = useState<string[]>(() =>
    currentMemberId ? [currentMemberId] : [],
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCommunication = categoryName.trim().toLowerCase() === 'communication';

  useEffect(() => {
    const savedDraft = readJsonStorage<StoredDraft>(draftKey);
    if (savedDraft && savedDraft.statusText?.trim()) {
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
    setCompletedByMemberIds(currentMemberId ? [currentMemberId] : []);
  }, [draftKey, lastPairKey, currentMemberId]);

  useEffect(() => {
    if (activeCategories.length === 0 || isCustomCategory) return;
    const defaultCategory =
      activeCategories.find((c) => c.name.trim().toLowerCase() === 'support') ??
      activeCategories[0]!;

    const matchedCat = activeCategories.find((c) => c.name === categoryName);
    if (!matchedCat) {
      setCategoryName(defaultCategory.name);
      if (!isCustomTitle) {
        setTitleName(defaultCategory.titles[0]?.name ?? '');
      }
      return;
    }
    if (!isCustomTitle) {
      const matchedTitle = matchedCat.titles.find((t) => t.name === titleName);
      if (!matchedTitle) {
        setTitleName(matchedCat.titles[0]?.name ?? '');
      }
    }
  }, [activeCategories, categoryName, titleName, isCustomCategory, isCustomTitle]);

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
    mutationFn: (vars: {
      cat: string;
      title: string;
      formattedStatus: string;
      rawStatus: string;
      memberIds: string[];
    }) =>
      reportsApi.createEntry(teamId, reportDate, {
        categoryName: vars.cat,
        titleName: vars.title,
        statusLines: vars.formattedStatus ? [vars.formattedStatus] : [],
        completedByMemberIds: vars.memberIds,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['report', teamId] });
      const previous = queryClient.getQueriesData<{
        report: DailyReportDto;
        dictionary: DictionaryCategory[];
        members: MemberSummary[];
      }>({ queryKey: ['report', teamId, 'workspace'] });

      const nowIso = new Date().toISOString();
      const assignees = vars.memberIds.length > 0 ? vars.memberIds : [null];
      const memberMap = new Map(members.map((m) => [m.id, m.displayName]));

      const optimisticEntries: WorkEntryDto[] = assignees.map((mId, idx) => ({
        id: `optimistic-${Date.now()}-${idx}`,
        groupId: 'optimistic-group',
        statusText: vars.formattedStatus,
        completedByMemberId: mId,
        completedByLabel: null,
        completedByDisplay: mId ? (memberMap.get(mId) ?? '') : '',
        position: 999_000 + idx,
        version: 1,
        createdByUserId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      }));

      queryClient.setQueriesData<{
        report: DailyReportDto;
        dictionary: DictionaryCategory[];
        members: MemberSummary[];
      }>({ queryKey: ['report', teamId, 'workspace'] }, (old) => {
        if (!old) return old;
        const groups = [...old.report.groups];
        const idx = groups.findIndex(
          (g) => g.categoryName === vars.cat && g.titleName === vars.title,
        );
        if (idx >= 0) {
          const target = groups[idx]!;
          groups[idx] = {
            ...target,
            entries: [...target.entries, ...optimisticEntries],
          };
        } else {
          groups.push({
            id: `optimistic-group-${Date.now()}`,
            categoryId: '',
            categoryName: vars.cat,
            titleId: '',
            titleName: vars.title,
            position: (groups.length + 1) * 10,
            numberingMode: vars.cat.toLowerCase() === 'support' ? 'numbered' : 'plain',
            entries: optimisticEntries,
          });
        }
        return {
          ...old,
          report: {
            ...old.report,
            groups,
          },
        };
      });

      setErrorMsg(null);
      writeJsonStorage(lastPairKey, { categoryName: vars.cat, titleName: vars.title });
      setIsCustomCategory(false);
      setIsCustomTitle(false);
      setCommunicationType('');
      setStatusText('');
      setStatusFocused(false);
      setCompletedByMemberIds(currentMemberId ? [currentMemberId] : []);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Ignore
      }

      return { previous, vars };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.vars) {
        setStatusText(context.vars.rawStatus);
        setCompletedByMemberIds(context.vars.memberIds);
      }
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to add entry');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['report', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['dictionary', teamId] });
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
    const cat = categoryName.trim();
    const title = titleName.trim();
    const trimmedStatus = statusText.trim();
    if (!cat || !title || !trimmedStatus) {
      setErrorMsg('Report Category, Title, and Status are required.');
      return;
    }
    const hasCommPrefix = /^(officer|sailor)\s*:/i.test(trimmedStatus);
    const formattedStatus =
      isCommunication && communicationType && !hasCommPrefix
        ? `${communicationType}: ${trimmedStatus}`
        : trimmedStatus;
    const effectiveMemberIds = isNilCommunicationStatus(formattedStatus)
      ? []
      : completedByMemberIds;
    createMutation.mutate({
      cat,
      title,
      formattedStatus,
      rawStatus: statusText,
      memberIds: effectiveMemberIds,
    });
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
              {isCustomCategory ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={categoryName}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setCategoryName(nextVal);
                      if (nextVal.trim().toLowerCase() !== 'communication') {
                        setCommunicationType('');
                      }
                    }}
                    placeholder="Type new category…"
                    disabled={disabled || createMutation.isPending}
                    maxLength={80}
                    autoFocus
                  />
                  {activeCategories.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Choose from existing categories"
                      aria-label="Choose from existing categories"
                      disabled={disabled || createMutation.isPending}
                      onClick={() => {
                        const fallbackCat = activeCategories[0]!;
                        setIsCustomCategory(false);
                        setIsCustomTitle(false);
                        setCategoryName(fallbackCat.name);
                        setTitleName(fallbackCat.titles[0]?.name ?? '');
                      }}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <Select
                  value={categoryName}
                  onValueChange={(nextCatName) => {
                    if (nextCatName === '__custom__') {
                      setIsCustomCategory(true);
                      setIsCustomTitle(true);
                      setCategoryName('');
                      setTitleName('');
                      setCommunicationType('');
                      return;
                    }
                    setCategoryName(nextCatName);
                    if (nextCatName.trim().toLowerCase() !== 'communication') {
                      setCommunicationType('');
                    }
                    const nextCat = activeCategories.find((c) => c.name === nextCatName);
                    setIsCustomTitle(false);
                    setTitleName(nextCat?.titles[0]?.name ?? '');
                  }}
                  disabled={disabled || createMutation.isPending}
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
                    <SelectItem value="__custom__">+ Type new category…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Title</Label>
              {isCustomCategory || isCustomTitle ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={titleName}
                    onChange={(e) => setTitleName(e.target.value)}
                    placeholder="Type new title…"
                    disabled={disabled || createMutation.isPending}
                    maxLength={120}
                    autoFocus={!isCustomCategory}
                  />
                  {!isCustomCategory && titleOptions.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Choose from existing titles"
                      aria-label="Choose from existing titles"
                      disabled={disabled || createMutation.isPending}
                      onClick={() => {
                        setIsCustomTitle(false);
                        setTitleName(titleOptions[0]?.name ?? '');
                      }}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <Select
                  value={titleName}
                  onValueChange={(nextTitle) => {
                    if (nextTitle === '__custom__') {
                      setIsCustomTitle(true);
                      setTitleName('');
                      return;
                    }
                    setTitleName(nextTitle);
                  }}
                  disabled={disabled || createMutation.isPending}
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
                    <SelectItem value="__custom__">+ Type new title…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="relative grid gap-1.5 md:col-span-2 lg:col-span-1">
              <Label htmlFor="composer-status">Status</Label>
              <div className={isCommunication ? 'flex flex-col items-stretch gap-2 sm:flex-row sm:items-start' : 'grid'}>
                {isCommunication && (
                  <Select
                    className="w-full shrink-0 sm:w-[148px]"
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
                  className="min-h-[38px] min-w-0 flex-1 resize-y py-1.5"
                  value={statusText}
                  onFocus={() => setStatusFocused(true)}
                  onBlur={() => setStatusFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setStatusFocused(false);
                  }}
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
              <StatusSuggestionChips
                variant="popover"
                open={statusFocused && !disabled}
                value={statusText}
                resetKey={`${categoryName}::${titleName}`}
                items={frequentStatuses}
                titleId={
                  activeCategories
                    .find((c) => c.name === categoryName)
                    ?.titles.find((t) => t.name === titleName)?.id
                }
                showAllWhenNoTitle
                onPick={(picked) => setStatusText((prev) => appendStatusSuggestion(prev, picked))}
                onClose={() => setStatusFocused(false)}
              />
            </div>

            <Button
              type="submit"
              className="h-9 w-full px-4 md:col-span-2 lg:col-span-1 lg:w-auto"
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
