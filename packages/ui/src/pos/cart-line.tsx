import type { Money } from '@rbp/types';
import { cn, formatMoney } from '@rbp/utils';
import type * as React from 'react';

export interface CartLineProps extends Omit<React.ComponentProps<'li'>, 'children' | 'onSelect'> {
  name: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  locale?: string;
  /** Modifiers/notes, e.g. "No onion · Extra spicy". */
  note?: React.ReactNode;
  /** Discount/void markers shown under the name. */
  badges?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  /** Controls revealed for the selected line (quantity stepper, discount, remove). */
  actions?: React.ReactNode;
  voided?: boolean;
  className?: string;
}

/** One cart row. Tap selects it to reveal line actions — no hover-only affordances. */
export function CartLine({
  name,
  quantity,
  unitPrice,
  lineTotal,
  locale,
  note,
  badges,
  selected,
  onSelect,
  actions,
  voided,
  className,
  ...props
}: CartLineProps) {
  return (
    <li
      {...props}
      data-slot="cart-line"
      data-selected={selected || undefined}
      className={cn(
        'border-b last:border-b-0 data-[selected]:bg-primary/5',
        voided && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        data-touch="pos"
        aria-expanded={actions ? !!selected : undefined}
        onClick={onSelect}
        className="flex min-h-touch-pos w-full items-start gap-3 px-3 py-2.5 text-left focus-ring"
      >
        <span className="mt-0.5 min-w-8 rounded-md bg-muted px-1.5 py-0.5 text-center text-sm font-bold tabular">
          {quantity}×
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block font-medium', voided && 'line-through')}>{name}</span>
          <span className="block text-caption text-muted-foreground tabular">
            @ {formatMoney(unitPrice, locale)}
          </span>
          {note && <span className="block text-caption text-muted-foreground">{note}</span>}
          {badges && <span className="mt-1 flex flex-wrap gap-1">{badges}</span>}
        </span>
        <span className={cn('font-semibold tabular', voided && 'line-through')}>
          {formatMoney(lineTotal, locale)}
        </span>
      </button>
      {selected && actions && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">{actions}</div>
      )}
    </li>
  );
}
