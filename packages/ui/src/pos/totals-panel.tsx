import type { Money } from '@rbp/types';
import { cn, formatMoney } from '@rbp/utils';
import type * as React from 'react';

export interface TotalsRow {
  id: string;
  label: React.ReactNode;
  amount: Money;
  /** Discounts render as negative/green. */
  kind?: 'default' | 'discount' | 'charge';
  /** Row control, e.g. a remove button for an applied discount/charge. */
  action?: React.ReactNode;
}

export interface TotalsPanelProps {
  rows: TotalsRow[];
  totalLabel: React.ReactNode;
  total: Money;
  locale?: string;
  /** Item count etc. under the total. */
  meta?: React.ReactNode;
  className?: string;
}

/** The subtotal / discount / charge rows on their own (e.g. scrolled with the lines on short screens). */
export function TotalsBreakdown({
  rows,
  locale,
  className,
}: {
  rows: TotalsRow[];
  locale?: string;
  className?: string;
}) {
  return (
    <dl className={cn('space-y-1 text-sm', className)}>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2">
          <dt className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</dt>
          <dd className={cn('tabular', r.kind === 'discount' && 'text-status-success-fg')}>
            {r.kind === 'discount' && r.amount.amount > 0 ? '−' : ''}
            {formatMoney(r.amount, locale)}
          </dd>
          {r.action && <dd className="-my-1 shrink-0">{r.action}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Persistent order totals. The grand total is large and always visible (POS rule). */
export function TotalsPanel({
  rows,
  totalLabel,
  total,
  locale,
  meta,
  className,
}: TotalsPanelProps) {
  return (
    <section data-slot="totals-panel" className={cn('space-y-1.5', className)}>
      {rows.length > 0 && <TotalsBreakdown rows={rows} locale={locale} />}
      <div className="flex items-end justify-between gap-4 border-t pt-2">
        <div>
          <div className="font-semibold">{totalLabel}</div>
          {meta && <div className="text-caption text-muted-foreground">{meta}</div>}
        </div>
        <output aria-live="polite" className="text-pos-total tabular">
          {formatMoney(total, locale)}
        </output>
      </div>
    </section>
  );
}
