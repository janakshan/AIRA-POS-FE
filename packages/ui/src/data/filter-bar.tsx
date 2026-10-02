import type * as React from 'react';
import { cn } from '@rbp/utils';

/**
 * Toolbar above lists: search grows, filters wrap on desktop and scroll horizontally on
 * phones, actions stay right-aligned.
 */
export function FilterBar({
  search,
  filters,
  actions,
  className,
}: {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="filter-bar"
      className={cn('flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center', className)}
    >
      {search && <div className="min-w-0 md:w-72 md:flex-none lg:w-80">{search}</div>}
      {filters && (
        <div className="-mx-page scrollbar-none flex min-w-0 flex-1 gap-2 overflow-x-auto px-page md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&>*]:shrink-0">
          {filters}
        </div>
      )}
      {actions && <div className="flex shrink-0 gap-2 md:ml-auto">{actions}</div>}
    </div>
  );
}

/** Toggle chip used for quick filters (status, category). */
export function FilterChip({
  active,
  className,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 touch-safe items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium whitespace-nowrap focus-ring transition-colors hover:bg-accent',
        active && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
        className,
      )}
      {...props}
    />
  );
}
