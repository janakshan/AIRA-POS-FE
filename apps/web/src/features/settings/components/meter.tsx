import { cn } from '@rbp/utils';

/** A labelled bar: translation coverage (SET-009) or plan usage (SET-010, `limit` warns when full). */
export function Meter({
  label,
  value,
  max,
  limit = false,
}: {
  label: string;
  value: number;
  max: number | null;
  limit?: boolean;
}) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max ?? value}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full', limit && pct >= 90 ? 'bg-status-warning' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
