import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-semibold transition-colors shrink-0 select-none',
  {
    variants: {
      variant: {
        default: 'border-orange-300 bg-orange-50 text-orange-800',
        dark: 'border-zinc-950 bg-zinc-950 text-primary',
        secondary: 'border-zinc-200 bg-zinc-100 text-zinc-700',
        outline: 'border-zinc-200 bg-white text-zinc-700',
        warning: 'border-amber-300 bg-amber-50 text-amber-900',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        destructive: 'border-rose-200 bg-rose-50 text-rose-700',
      },
      size: {
        sm: 'h-6 px-2 text-[11px] uppercase tracking-wide',
        toolbar: 'h-8 px-3 text-xs',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'sm',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}
