import type { CurrencyCode, DashboardSummary } from '@rbp/types';
import { EmptyState } from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { BarChart3Icon } from 'lucide-react';

interface Props {
  data: DashboardSummary['hourlySales'];
  currency: CurrencyCode;
  locale: string;
  emptyLabel: string;
}

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Single-series bar chart: one hue, thin bars anchored to baseline, hover tooltip, sr-only table. */
export function HourlySalesChart({ data, currency, locale, emptyLabel }: Props) {
  const max = Math.max(...data.map((d) => d.amount), 0);
  if (max === 0) return <EmptyState icon={BarChart3Icon} title={emptyLabel} className="py-8" />;

  return (
    <figure>
      <div className="flex h-48 items-end gap-0.5 border-b border-border" aria-hidden>
        {data.map((d) => {
          const label = `${hourLabel(d.hour)} · ${formatMoney({ amount: d.amount, currency }, locale)}`;
          return (
            <div
              key={d.hour}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <div
                className="w-full max-w-7 rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(2, (d.amount / max) * 100)}%` }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block">
                {label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5 text-[10px] text-muted-foreground" aria-hidden>
        {data.map((d, i) => (
          <span key={d.hour} className="flex-1 text-center tabular-nums">
            {i % 3 === 0 ? String(d.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.hour}>
              <th scope="row">{hourLabel(d.hour)}</th>
              <td>{formatMoney({ amount: d.amount, currency }, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
