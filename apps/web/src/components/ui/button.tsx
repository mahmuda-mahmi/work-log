import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shrink-0 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-amber-600/40 shadow-xs hover:bg-orange-600 hover:text-white',
        dark: 'bg-zinc-950 text-white border border-zinc-950 shadow-xs hover:bg-zinc-800',
        destructive:
          'bg-rose-50 text-rose-700 border border-rose-200 shadow-xs hover:bg-rose-600 hover:text-white hover:border-rose-600',
        outline:
          'border border-zinc-200 bg-white text-zinc-950 shadow-xs hover:bg-zinc-100 hover:border-zinc-300',
        secondary:
          'bg-zinc-100 text-zinc-900 border border-zinc-200 hover:bg-zinc-200/80',
        ghost: 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950',
        link: 'text-orange-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 text-sm',
        sm: 'h-8 px-3 text-xs',
        xs: 'h-7 px-2.5 text-xs',
        icon: 'h-8 w-8 p-0',
        'icon-xs': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
