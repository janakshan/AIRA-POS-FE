import type { Kot, KotStatus } from '@rbp/types';
import { EmptyState, FilterChip, Skeleton, StatusBadge, toast } from '@rbp/ui';
import { cn, nowIso } from '@rbp/utils';
import { ChefHatIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useKitchenStations } from '@/features/catalog/api/queries';
import { useKotAction, useKots } from '@/features/restaurant/api/queries';
import { KotCard } from '../components/kot-card';
import { KotPrintDialog } from '../components/kot-print-dialog';

const COLUMNS: KotStatus[] = ['NEW', 'PREPARING', 'READY'];

function useNow(intervalMs: number) {
  const [now, setNow] = useState(nowIso);
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowIso()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * KOT-003 Kitchen board (FLOW-KOT-001): New → Preparing → Ready → served/picked up.
 * Polls every few seconds; a station filter lets each kitchen display show only its tickets.
 */
export function KitchenBoardPage() {
  const { t } = useTranslation('pos');
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const { can } = useAccess();
  const canManage = can('kot.manage');
  const stations = useKitchenStations(me?.currentLocation?.id);
  const [params, setParams] = useSearchParams();
  const stationId = params.get('station') ?? undefined;
  const kots = useKots(stationId ? { stationId } : {});
  const act = useKotAction();
  const now = useNow(15_000);
  const [printing, setPrinting] = useState<Kot | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Phones show one column at a time (three side by side don't fit).
  const [shown, setShown] = useState<KotStatus>('NEW');

  // Announce tickets that arrive while the board is open. Switching station (or location)
  // shows a different list, so the first load of each view seeds it silently.
  const view = `${me?.currentLocation?.id ?? ''}|${stationId ?? ''}`;
  const seen = useRef<{ view: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!kots.data) return;
    const ids = new Set(kots.data.map((k) => k.id));
    if (seen.current?.view === view) {
      const fresh = kots.data.filter((k) => !seen.current?.ids.has(k.id));
      if (fresh.length) {
        const text = t('kot.arrived', { count: fresh.length });
        setAnnouncement(text);
        toast.info(text, { duration: 2500 });
      }
    }
    seen.current = { view, ids };
  }, [kots.data, view, t]);

  const run = (kot: Kot, action: 'start' | 'ready' | 'complete') =>
    act.mutate({ id: kot.id, action }, { onError: (e) => toast.error(errorMessage(e)) });

  const column = (status: KotStatus) =>
    (kots.data ?? [])
      .filter((k) => k.status === status)
      // Cancellations first so the cook sees them before starting the food.
      .sort((a, b) => Number(b.kind === 'CANCEL') - Number(a.kind === 'CANCEL'));

  return (
    <Screen id="KOT-003" title={t('nav:items.kitchen')} className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('nav:items.kitchen')}</h1>
        <div
          role="group"
          aria-label={t('kot.station')}
          className="scrollbar-none flex gap-2 overflow-x-auto"
        >
          <FilterChip active={!stationId} onClick={() => setParams({}, { replace: true })}>
            {t('kot.allStations')}
          </FilterChip>
          {stations.data?.map((s) => (
            <FilterChip
              key={s.id}
              active={stationId === s.id}
              onClick={() => setParams({ station: s.id }, { replace: true })}
            >
              {s.name}
            </FilterChip>
          ))}
        </div>
        {!canManage && (
          <span className="ml-auto text-sm text-muted-foreground">{t('kot.viewOnly')}</span>
        )}
      </div>
      {kots.isError ? (
        <QueryError error={kots.error} onRetry={() => kots.refetch()} />
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t('kot.columns')}
            className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border bg-muted/30 p-1 md:hidden"
          >
            {COLUMNS.map((status) => {
              const active = shown === status;
              return (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  id={`kot-tab-${status}`}
                  aria-selected={active}
                  aria-controls={`kot-panel-${status}`}
                  onClick={() => setShown(status)}
                  className={cn(
                    'flex h-touch-pos min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-base font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    active
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {/* One text node: the tab reads "New 3" and "New" alone stays the column's. */}
                  <span className="truncate tabular">
                    {`${t(`kot.column.${status}`)} ${kots.data ? column(status).length : '–'}`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-3">
            {COLUMNS.map((status) => {
              const items = column(status);
              return (
                <section
                  key={status}
                  id={`kot-panel-${status}`}
                  aria-labelledby={`kot-col-${status}`}
                  className={cn(
                    'min-h-0 flex-col gap-3 rounded-xl border bg-muted/30 p-3 md:flex',
                    shown === status ? 'flex' : 'hidden',
                  )}
                >
                  <h2 id={`kot-col-${status}`} className="flex items-center justify-between">
                    <StatusBadge status={status === 'NEW' ? 'PENDING' : status} size="lg">
                      {t(`kot.column.${status}`)}
                    </StatusBadge>
                    <span className="text-lg font-semibold tabular">{items.length}</span>
                  </h2>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                    {!kots.data ? (
                      <Skeleton className="h-40" />
                    ) : items.length === 0 ? (
                      <EmptyState icon={ChefHatIcon} title={t('kot.empty')} />
                    ) : (
                      items.map((kot) => (
                        <KotCard
                          key={kot.id}
                          kot={kot}
                          now={now}
                          canManage={canManage}
                          busy={act.isPending && act.variables.id === kot.id}
                          onAction={(action) => run(kot, action)}
                          onPrint={() => setPrinting(kot)}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      <KotPrintDialog
        kot={printing}
        printerName={stations.data?.find((s) => s.id === printing?.stationId)?.printerName ?? null}
        onOpenChange={(open) => !open && setPrinting(null)}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </Screen>
  );
}
