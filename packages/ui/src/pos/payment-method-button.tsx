import type * as React from 'react';
import { cn } from '@rbp/utils';

export interface PaymentMethodButtonProps extends React.ComponentProps<'button'> {
  icon: React.ReactNode;
  label: React.ReactNode;
  /** e.g. amount already tendered with this method. */
  hint?: React.ReactNode;
  selected?: boolean;
}

/** Large tender button (Cash, Card, QR, Credit). */
export function PaymentMethodButton({
  icon,
  label,
  hint,
  selected,
  className,
  ...props
}: PaymentMethodButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-touch="pos"
      className={cn(
        'flex min-h-touch-pos-lg flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-3 text-center font-semibold focus-ring transition active:scale-[0.97] disabled:opacity-50 [&_svg]:size-6',
        selected
          ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
          : 'hover:bg-accent',
        className,
      )}
      {...props}
    >
      {icon}
      <span>{label}</span>
      {hint && (
        <span className="text-caption font-normal text-muted-foreground tabular">{hint}</span>
      )}
    </button>
  );
}
