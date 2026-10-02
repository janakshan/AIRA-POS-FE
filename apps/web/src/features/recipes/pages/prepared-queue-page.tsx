import type { PreparedItem, PreparedItemStatus } from '@rbp/types';
import {
  Button,
  Card,
  EmptyState,
  FilterChip,
  PageHeader,
  Skeleton,
  StatusBadge,
  type StatusTone,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { ArrowRightIcon, ChefHatIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { usePreparedItems } from '../api/queries';
import { AddPreparedDialog } from '../components/add-prepared-dialog';
import { DisposeDialog } from '../components/dispose-dialog';
import { formatDuration } from '../lib/format';
import { useRecipeLocation } from '../lib/location';

const STATUSES: PreparedItemStatus[] = ['AVAILABLE', 'EXPIRED', 'USED', 'DISPOSED'];
const TONE: Record<PreparedItemStatus, StatusTone> = {
  AVAILABLE: 'success',
  EXPIRED: 'danger',
  USED: 'info',
  DISPOSED: 'neutral',
};
const FLOW = ['cancelled', 'prepared', 'queued', 'nextOrder', 'orDispose'] as const;

/** REC-005 Prepared item queue: cooked food that was cancelled (SCN-004) or made extra. */
export function PreparedQueuePage() {
  const { t, i18n } = useTranslation('recipes');
  const locale = localeFor(i18n.language);
  const { can } = useAccess();
  const { list, locationId, locationName, setLocation } = useRecipeLocation(['status']);
  const status = STATUSES.find((s) => s === list.filters.status);
  const items = usePreparedItems({ locationId, ...(status ? { status } : {}) });
  const all = usePreparedItems({ locationId });
  const [disposing, setDisposing] = useState<PreparedItem | null>(null);
  const [adding, setAdding] = useState(false);
  const count = (s: PreparedItemStatus) =>
    all.data?.filter((p) => p.status === s).reduce((n, p) => n + (p.remaining || p.quantity), 0);

  return (
    <Screen id="REC-005" title={t('prepared.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('prepared.title')}
        description={t('prepared.hint', { location: locationName })}
        actions={
          can('production.manage') && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> {t('prepared.add')}
            </Button>
          )
        }
      />

      <Card className="p-4">
        <p className="mb-2 text-sm font-medium">{t('prepared.flowTitle')}</p>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {FLOW.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              {i > 0 && <ArrowRightIcon className="size-3.5" aria-hidden />}
              {t(`prepared.flow.${step}`)}
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <LocationSelect value={locationId} onChange={setLocation} label={t('fields.location')} />
        {([null, ...STATUSES] as const).map((s) => (
          <FilterChip
            key={s ?? 'all'}
            active={(status ?? null) === s}
            onClick={() => list.setFilter('status', s)}
          >
            {s ? t(`status.${s}`) : t('prepared.all')}
            {s && s !== 'USED' && s !== 'DISPOSED' && count(s) ? ` (${count(s)})` : ''}
          </FilterChip>
        ))}
      </div>

      {items.isError ? (
        <QueryError error={items.error} onRetry={() => items.refetch()} />
      ) : !items.data ? (
        <Skeleton className="h-40" />
      ) : !items.data.length ? (
        <EmptyState icon={ChefHatIcon} title={t('prepared.empty')} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label={t('prepared.title')}>
          {items.data.map((p) => {
            // Measured from the last fetch (refetched every minute).
            const minutesLeft = (new Date(p.expiresAt).getTime() - items.dataUpdatedAt) / 60_000;
            const open = p.status === 'AVAILABLE' || p.status === 'EXPIRED';
            return (
              <li key={p.id}>
                <Card className="h-full gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {p.productName}{' '}
                        <span className="text-muted-foreground tabular">
                          ×{open ? p.remaining : p.quantity}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {p.source.kind === 'KOT_CANCEL'
                          ? t('prepared.fromCancel', { order: p.source.orderNumber ?? '' })
                          : t('prepared.madeExtra')}
                        {p.note ? ` · ${p.note}` : ''}
                      </p>
                    </div>
                    <StatusBadge tone={TONE[p.status]} size="sm">
                      {t(`status.${p.status}`)}
                    </StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('prepared.preparedAt')}</dt>
                      <dd>
                        {formatDateTime(p.preparedAt, { locale })}
                        <span className="block text-xs text-muted-foreground">{p.preparedBy}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('prepared.sellBy')}</dt>
                      <dd>
                        {p.status === 'AVAILABLE'
                          ? t('prepared.left', { time: formatDuration(minutesLeft) })
                          : p.status === 'EXPIRED'
                            ? t('prepared.expiredAgo', { time: formatDuration(-minutesLeft) })
                            : formatDateTime(p.expiresAt, { locale })}
                      </dd>
                    </div>
                  </dl>
                  {(p.uses.length > 0 || p.disposal) && (
                    <ul className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                      {p.uses.map((u) => (
                        <li key={`${u.orderNumber}-${u.at}`}>
                          {t('prepared.usedOn', { count: u.quantity, order: u.orderNumber })} ·{' '}
                          {formatDateTime(u.at, { locale })}
                        </li>
                      ))}
                      {p.disposal && (
                        <li>
                          {t('prepared.disposedAs', {
                            count: p.disposal.quantity,
                            outcome: t(`outcome.${p.disposal.outcome}`),
                            reason: p.disposal.reason,
                            name: p.disposal.by,
                          })}
                        </li>
                      )}
                    </ul>
                  )}
                  {open && (
                    <div className="mt-auto flex justify-end">
                      <Button
                        variant={p.status === 'EXPIRED' ? 'default' : 'outline'}
                        size="sm"
                        className="pointer-coarse:min-h-11"
                        onClick={() => setDisposing(p)}
                        aria-label={t('prepared.disposeFor', { name: p.productName })}
                      >
                        <Trash2Icon /> {t('prepared.dispose')}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <DisposeDialog item={disposing} onOpenChange={(o) => !o && setDisposing(null)} />
      {can('production.manage') && (
        <AddPreparedDialog open={adding} onOpenChange={setAdding} locationId={locationId} />
      )}
    </Screen>
  );
}
