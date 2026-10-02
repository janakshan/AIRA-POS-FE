import type * as React from 'react';
import { cn } from '@rbp/utils';

export interface PosAction {
  id: string;
  label: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Needs employee PIN — shown with a lock marker. */
  protected?: boolean;
  tone?: 'default' | 'danger';
}

/** One-tap common actions (hold, discount, customer, void…). Wraps into a grid; never hover-only. */
export function PosActionBar({
  actions,
  className,
  protectedLabel = 'Requires PIN',
  protectedBadge = 'PIN',
}: {
  actions: PosAction[];
  className?: string;
  protectedLabel?: string;
  /** Short visible marker on protected actions (not colour alone). */
  protectedBadge?: string;
}) {
  return (
    <div
      role="toolbar"
      className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6', className)}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          data-touch="pos"
          onClick={a.onClick}
          disabled={a.disabled}
          className={cn(
            'relative flex min-h-touch-pos flex-col items-center justify-center gap-1 rounded-xl border bg-card px-2 py-2 text-sm leading-tight font-medium focus-ring transition hover:bg-accent active:scale-[0.97] active:bg-accent disabled:opacity-50 [&_svg]:size-5',
            a.tone === 'danger' && 'border-destructive/40 text-destructive',
          )}
        >
          {a.icon}
          <span className="text-center">{a.label}</span>
          {a.protected && (
            <span className="absolute top-1 right-1 rounded bg-status-warning/20 px-1 text-[10px] leading-4 font-semibold text-status-warning-fg">
              <span aria-hidden>{protectedBadge}</span>
              <span className="sr-only">{` (${protectedLabel})`}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
