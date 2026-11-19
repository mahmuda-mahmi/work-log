import type { FrequentStatusDto } from '@cghq/contracts';

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
  titleId?: string | null;
  showAllWhenNoTitle?: boolean;
  onPick: (statusText: string) => void;
  variant?: 'inline' | 'popover';
  onClose?: () => void;
}

export function StatusSuggestionChips({
  items,
  titleId,
  showAllWhenNoTitle = false,
  onPick,
  variant = 'inline',
  onClose,
}: StatusSuggestionChipsProps) {
  const suggestions = filterSuggestionsForTitle(items, titleId, showAllWhenNoTitle);
  if (suggestions.length === 0) return null;

  const chipList = (
    <div
      className={
        variant === 'popover'
          ? 'flex max-h-52 flex-wrap items-center gap-1.5 overflow-y-auto'
          : 'flex max-h-44 flex-wrap items-center gap-1.5 overflow-y-auto'
      }
    >
      {suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item.statusText)}
          className="cursor-pointer rounded-md border border-primary-border bg-accent px-2.5 py-1 text-left text-xs font-medium text-accent-foreground transition-colors hover:bg-primary hover:text-white"
          title="Click to append into status box"
        >
          {item.statusText}
        </button>
      ))}
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
