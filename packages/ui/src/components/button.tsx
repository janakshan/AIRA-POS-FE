import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@rbp/utils';

export const buttonVariants = cva(
  "relative inline-flex touch-safe shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap focus-ring transition-[color,background-color,box-shadow,transform] duration-(--duration-fast) outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:not-aria-busy:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        success: 'bg-success text-success-foreground shadow-xs hover:bg-success/90',
        warning: 'bg-warning text-warning-foreground shadow-xs hover:bg-warning/90',
        outline: 'border bg-card shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4',
        lg: 'h-11 px-6 text-base',
        /** Touch-first size for POS primary actions (56px). */
        pos: 'h-touch-pos px-6 text-base',
        /** Hero POS actions such as Pay (80px). */
        'pos-lg': 'h-touch-pos-lg px-8 text-lg font-semibold',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-lg': 'size-12 [&_svg:not([class*=size-])]:size-5',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, marks the button busy and blocks clicks while keeping its width. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block, className }));
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      data-slot="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2Icon className="animate-spin" aria-hidden />
        </span>
      )}
      {loading ? (
        <span className="invisible inline-flex items-center gap-2">{children}</span>
      ) : (
        children
      )}
    </button>
  );
}

/** Visually joins adjacent buttons (segmented controls, split actions). */
export function ButtonGroup({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        'isolate inline-flex',
        orientation === 'horizontal'
          ? '[&>*:not(:first-child)]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none'
          : 'flex-col [&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none',
        '[&>*:focus-visible]:z-10',
        className,
      )}
      {...props}
    />
  );
}
