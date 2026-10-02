import type { Kot } from '@rbp/types';
import { Button, StatusBadge } from '@rbp/ui';
import { cn, formatElapsed } from '@rbp/utils';
import { ArmchairIcon, BikeIcon, PrinterIcon, ShoppingBagIcon, TimerIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { kotHeadline, LATE_MINUTES } from '../lib/kot';

const TYPE_ICON = {
  DINE_IN: ArmchairIcon,
  TAKEAWAY: ShoppingBagIcon,
  DELIVERY: BikeIcon,
  RETAIL: ShoppingBagIcon,
};

/**
 * KOT-001 ticket on the kitchen board: big order type + table, live age, items with notes.
 * CANCEL tickets are red and say what happens to the food.
 */
export function KotCard({
  kot,
  now,
  canManage,
  busy,
  onAction,
  onPrint,
}: {
  kot: Kot;
  /** Shared clock so every card ticks together. */
  now: string;
  canManage: boolean;
  busy: boolean;
  onAction: (action: 'start' | 'ready' | 'complete') => void;
  onPrint: () => void;
}) {
  const { t } = useTranslation('pos');
  const cancel = kot.kind === 'CANCEL';
  const minutes = (new Date(now).getTime() - new Date(kot.createdAt).getTime()) / 60_000;
  const late = !cancel && kot.status !== 'READY' && minutes >= LATE_MINUTES;
  const Icon = TYPE_ICON[kot.orderType];
  const next: { action: 'start' | 'ready' | 'complete'; label: string } | null = cancel
    ? { action: 'complete', label: t('kot.acknowledge') }
    : kot.status === 'NEW'
      ? { action: 'start', label: t('kot.start') }
      : kot.status === 'PREPARING'
        ? { action: 'ready', label: t('kot.ready') }
        : kot.status === 'READY'
          ? {
              action: 'complete',
              label: kot.orderType === 'DINE_IN' ? t('kot.served') : t('kot.pickedUp'),
            }
          : null;

  return (
    <article
      aria-label={`${kot.number} · ${kotHeadline(kot, t)}${cancel ? ` · ${t('kot.cancelTicket')}` : ''}`}
      className={cn(
        'flex flex-col gap-3 rounded-xl border-2 bg-card p-3 shadow-sm',
        cancel
          ? 'border-status-danger bg-status-danger/10'
          : late
            ? 'border-status-warning'
            : 'border-border',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-xl font-bold">
            <Icon className="size-5 shrink-0" aria-hidden />
            {kotHeadline(kot, t)}
          </p>
          <p className="text-sm text-muted-foreground">
            {kot.number} · {kot.orderNumber}
          </p>
        </div>
        <span
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 font-mono text-lg font-semibold tabular-nums',
            late ? 'bg-status-warning/20 text-status-warning-fg' : 'bg-muted',
          )}
        >
          <TimerIcon className="size-4" aria-hidden />
          {formatElapsed(kot.createdAt, now)}
          {late && <span className="sr-only">{t('kot.late')}</span>}
        </span>
      </header>
      {cancel && (
        <StatusBadge tone="danger" size="lg">
          {t('kot.cancelTicket')}
        </StatusBadge>
      )}
      <ul className="space-y-1.5">
        {kot.items.map((item) => (
          <li key={item.lineId} className="leading-snug">
            <span className={cn('text-lg font-semibold', cancel && 'line-through')}>
              <span className="tabular">{item.quantity}</span> × {item.name}
            </span>
            {item.note && (
              <span className="block rounded bg-status-warning/15 px-1.5 py-0.5 text-sm font-medium text-status-warning-fg">
                {item.note}
              </span>
            )}
            {item.disposition && (
              <span className="block text-sm font-medium">
                {t(`disposition.${item.disposition}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {kot.stationName} · {kot.createdBy}
      </p>
      <div className="mt-auto flex gap-2">
        {next && canManage && (
          <Button
            size="pos"
            className="flex-1"
            variant={cancel ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => onAction(next.action)}
            aria-label={`${next.label} ${kot.number}`}
          >
            {next.label}
          </Button>
        )}
        <Button
          size="pos"
          variant="outline"
          onClick={onPrint}
          aria-label={t('kot.print', { number: kot.number })}
        >
          <PrinterIcon />
        </Button>
      </div>
    </article>
  );
}
