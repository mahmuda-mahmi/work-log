import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectContextValue {
  value: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  labels: Map<string, React.ReactNode>;
  registerLabel: (val: string, label: React.ReactNode) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Select({ value = '', onValueChange, disabled, className, children }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const labelsRef = React.useRef(new Map<string, React.ReactNode>());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const registerLabel = React.useCallback((val: string, label: React.ReactNode) => {
    if (labelsRef.current.get(val) !== label) {
      labelsRef.current.set(val, label);
      forceUpdate();
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange,
        open,
        setOpen,
        disabled,
        labels: labelsRef.current,
        registerLabel,
      }}
    >
      <div ref={containerRef} className={cn('relative', className ?? 'w-full')}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) return null;
  const display = ctx.labels.get(ctx.value) ?? (ctx.value || placeholder);
  return <span className="truncate">{display}</span>;
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, disabled, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  const isDisabled = disabled ?? ctx?.disabled;

  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={ctx?.open ?? false}
      disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) ctx?.setOpen((o) => !o);
      }}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 shadow-2xs transition-colors placeholder:text-zinc-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer text-left',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
    </button>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);
  return (
    <div
      className={cn(
        'absolute left-0 top-[calc(100%+4px)] z-50 max-h-72 w-full min-w-[10rem] overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 text-zinc-950 shadow-lg',
        ctx?.open ? 'block' : 'hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);

  React.useEffect(() => {
    ctx?.registerLabel(value, children);
  }, [ctx, value, children]);

  const selected = ctx?.value === value;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => {
        ctx?.onValueChange?.(value);
        ctx?.setOpen(false);
      }}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-3 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-zinc-950',
        selected && 'bg-accent/70 font-semibold text-zinc-950',
        className,
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {selected && <Check className="h-4 w-4 text-primary-text" />}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}
