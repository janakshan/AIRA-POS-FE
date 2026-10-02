import { EmptyState } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { BarChart3Icon } from 'lucide-react';

export interface BarDatum {
  key: string;
  /** Axis label (short). */
  label: string;
  /** Tooltip / table label (long). */
  title: string;
  value: number;
  display: string;
}

/**
 * Single-series column chart (dataviz: one hue, 4px rounded tops on the baseline, thin gap,
 * hover tooltip, sr-only table view). No legend: the card title names the series.
 * Negative values (a refund-heavy day) show as a zero-height bar with the value in the tooltip.
 */
export function BarChart({
  data,
  caption,
  emptyLabel,
  height = 'h-48',
  labelEvery = 1,
  max: fixedMax,
}: {
  data: BarDatum[];
  caption: string;
  emptyLabel: string;
  height?: string;
  /** Show every nth axis label. */
  labelEvery?: number;
  /** Shared y max for small multiples. */
  max?: number;
}) {
  const max = fixedMax ?? Math.max(...data.map((d) => d.value), 0);
  if (max <= 0) return <EmptyState icon={BarChart3Icon} title={emptyLabel} className="py-8" />;
  return (
    <figure>
      <div className={cn('flex items-end gap-0.5 border-b border-border', height)} aria-hidden>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-8 rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary"
              style={{
                height: `${Math.max(d.value > 0 ? 2 : 0, (Math.max(0, d.value) / max) * 100)}%`,
              }}
            />
            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block">
              {d.title} · {d.display}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-0.5 text-[10px] text-muted-foreground" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center tabular-nums">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.title}</th>
              <td>{d.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal bars for ranked lists (top products): label, bar, value. */
export function RankBars({ data, caption }: { data: BarDatum[]; caption: string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <figure>
      <ol className="space-y-1.5" aria-label={caption}>
        {data.map((d) => (
          <li
            key={d.key}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
          >
            <span className="truncate" title={d.title}>
              {d.label}
            </span>
            <span className="h-3 rounded-r-[4px] bg-muted" aria-hidden>
              <span
                className="block h-full rounded-r-[4px] bg-primary/80"
                style={{
                  width: `${max > 0 ? Math.max(1, (Math.max(0, d.value) / max) * 100) : 0}%`,
                }}
              />
            </span>
            <span className="text-right tabular-nums">{d.display}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
