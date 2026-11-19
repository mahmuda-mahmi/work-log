import { useEffect, useState } from 'react';
import type { FrequentStatusDto } from '@cghq/contracts';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

function normalizeSuggestionText(text: string): string {
  return text.trim().replace(/[^\S\n]+/g, ' ').replace(/\n+/g, '\n').toLowerCase();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether `suggestion` already appears as a complete segment in `current`
 * (bounded by start/comma/newline, ignoring optional Officer/Sailor prefix) so
 * prefixes like "OPS" do not falsely match "OPS (Dhaka Zone)".
 */
export function isSuggestionPresentInText(current: string, suggestion: string): boolean {
  const normCurrent = normalizeSuggestionText(current);
  const normSuggestion = normalizeSuggestionText(suggestion);
  if (!normCurrent || !normSuggestion) return false;
  const pattern = new RegExp(
    `(?:^|,|\\n)\\s*(?:(?:officer|sailor)\\s*:\\s*)?${escapeRegExp(normSuggestion)}(?=\\s*(?:$|,|\\n))`,
    'i',
  );
  return pattern.test(normCurrent);
}

/**
 * Appends a selected status suggestion to the current text with ", " between items,
 * avoiding a leading comma when empty/on a fresh line or double commas.
 */
export function appendStatusSuggestion(current: string, suggestion: string): string {
  const next = suggestion.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  if (/\n[ \t]*$/.test(current)) {
    return `${current}${next}`;
  }
  if (/,[ \t]*$/.test(current)) {
    return `${current.replace(/,[ \t]*$/, '')}, ${next}`;
  }
  return `${current.trimEnd()}, ${next}`;
}

export function filterSuggestionsForTitle(
  items: FrequentStatusDto[],
  titleId?: string | null,
  showAllWhenNoTitle = false,
): FrequentStatusDto[] {
  return items.filter(
    (item) =>
      item.titleIds.length === 0 ||
      (titleId ? item.titleIds.includes(titleId) : showAllWhenNoTitle),
  );
}

interface StatusSuggestionChipsProps {
  items: FrequentStatusDto[];
  value: string;
  resetKey?: string;
  titleId?: string | null;
  showAllWhenNoTitle?: boolean;
  onPick: (statusText: string) => void;
  variant?: 'inline' | 'popover';
  open?: boolean;
  onClose?: () => void;
}

export function StatusSuggestionChips({
  items,
  value,
  resetKey,
  titleId,
  showAllWhenNoTitle = false,
  onPick,
  variant = 'inline',
  open = true,
  onClose,
}: StatusSuggestionChipsProps) {
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setPickedIds(new Set());
  }, [resetKey]);

  useEffect(() => {
    if (!value.trim()) {
      setPickedIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    const normalizedValue = normalizeSuggestionText(value);
    setPickedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        const match = items.find((item) => item.id === id);
        if (match && normalizedValue.includes(normalizeSuggestionText(match.statusText))) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [value, items]);

  const suggestions = filterSuggestionsForTitle(items, titleId, showAllWhenNoTitle);
  if (!open || suggestions.length === 0) return null;

  function isItemUsed(item: FrequentStatusDto): boolean {
    return pickedIds.has(item.id) || isSuggestionPresentInText(value, item.statusText);
  }

  function handlePick(item: FrequentStatusDto) {
    if (isItemUsed(item)) return;
    setPickedIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    onPick(item.statusText);
  }

  const chipList = (
    <div
      className={
        variant === 'popover'
          ? 'flex max-h-52 flex-wrap items-center gap-1.5 overflow-y-auto'
          : 'flex max-h-44 flex-wrap items-center gap-1.5 overflow-y-auto'
      }
    >
      {suggestions.map((item) => {
        const used = isItemUsed(item);
        return (
          <span
            key={item.id}
            className={used ? 'inline-flex cursor-not-allowed' : 'inline-flex'}
            title={used ? 'Already selected for this status' : 'Click to append into status box'}
          >
            <button
              type="button"
              disabled={used}
              aria-disabled={used}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(item)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-left text-xs font-medium transition-colors',
                used
                  ? 'pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400 opacity-75'
                  : 'cursor-pointer border-primary-border bg-accent text-accent-foreground hover:bg-primary hover:text-white',
              )}
            >
              {used && <Check className="h-3 w-3 shrink-0 text-emerald-600" />}
              <span>{item.statusText}</span>
            </button>
          </span>
        );
      })}
    </div>
  );

  if (variant === 'popover') {
    return (
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="absolute top-full left-0 right-0 z-30 mt-1 rounded-lg border border-zinc-200 bg-white p-2.5 shadow-lg"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="text-[11px] font-semibold text-zinc-500">
            Frequently Used (click to add):
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              Done
            </button>
          )}
        </div>
        {chipList}
      </div>
    );
  }

  return (
    <div className="pt-1">
      <div className="mb-1 text-[11px] font-semibold text-zinc-500">
        Frequently Used (click to add):
      </div>
      {chipList}
    </div>
  );
}
