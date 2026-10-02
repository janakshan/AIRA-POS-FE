import type { DeliveryStatus, Order } from '@rbp/types';
import {
  Card,
  EmptyState,
  FilterChip,
  Input,
  MoneyText,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
} from '@rbp/ui';
import { formatElapsed, formatPhone } from '@rbp/utils';
import { BikeIcon, MapPinIcon, TruckIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useDeliveries, useRiders } from '../api/queries';
import { DeliveryActions } from '../components/delivery-actions';
import { DeliveryStatusBadge } from '../components/delivery-status-badge';
import { BOARD, deliveryCharge, localDay } from '../lib/status';

const ANY = 'all';
const STATUSES: DeliveryStatus[] = [...BOARD, 'CANCELLED'];

/**
 * DEL-001 Deliveries: today's delivery orders by stage — New → Confirmed → Preparing → Ready →
 * Out for delivery → Delivered — with the next step on each card. Riders see their own.
 */
export function DeliveryBoardPage() {
  const { t } = useTranslation('delivery');
  const { can } = useAccess();
  const dispatcher = can('delivery.manage');
  const list = useListParams({ filterKeys: ['date', 'rider', 'status'] });
  const ids = { date: useId(), rider: useId() };
  const date = list.filters.date ?? localDay();
  const riderId = list.filters.rider ?? undefined;
  const status = STATUSES.find((s) => s === list.filters.status);
  const deliveries = useDeliveries({ date, ...(riderId ? { riderId } : {}) });
  const riders = useRiders(dispatcher);
  const all = deliveries.data ?? [];
  const count = (s: DeliveryStatus) => all.filter((o) => o.delivery?.status === s).length;
  const shown = status ? all.filter((o) => o.delivery?.status === status) : all;
  const columns = (status ? [status] : BOARD).map((s) => ({
    status: s,
    orders: shown.filter((o) => o.delivery?.status === s),
  }));

  return (
    <Screen id="DEL-001" title={t('board.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={dispatcher ? t('board.title') : t('board.mine')}
        description={dispatcher ? t('board.hint') : t('board.mineHint')}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor={ids.date} className="text-sm font-medium">
            {t('fields.date')}
          </label>
          <Input
            id={ids.date}
            type="date"
            value={date}
            className="w-full sm:w-44"
            onChange={(e) => list.setFilter('date', e.target.value || null)}
          />
        </div>
        {dispatcher && (
          <div className="space-y-1.5">
            <label htmlFor={ids.rider} className="text-sm font-medium">
              {t('fields.rider')}
            </label>
            <Select
              value={riderId ?? ANY}
              onValueChange={(v) => list.setFilter('rider', v === ANY ? null : v)}
            >
              <SelectTrigger id={ids.rider} className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('board.anyRider')}</SelectItem>
                {riders.data?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('fields.status')}>
        {([null, ...STATUSES] as const).map((s) => (
          <FilterChip
            key={s ?? 'all'}
            active={(status ?? null) === s}
            onClick={() => list.setFilter('status', s)}
          >
            {s ? t(`status.${s}`) : t('board.all')}
            {s && count(s) ? ` (${count(s)})` : ''}
          </FilterChip>
        ))}
      </div>

      {deliveries.isError ? (
        <QueryError error={deliveries.error} onRetry={() => deliveries.refetch()} />
      ) : !deliveries.data ? (
        <Skeleton className="h-64" />
      ) : !shown.length ? (
        <EmptyState icon={TruckIcon} title={dispatcher ? t('board.empty') : t('board.emptyMine')} />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns
            .filter((c) => c.orders.length)
            .map((c) => (
              <section key={c.status} className="space-y-2" aria-labelledby={`col-${c.status}`}>
                <h2
                  id={`col-${c.status}`}
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <DeliveryStatusBadge status={c.status} />
                  <span className="text-muted-foreground">{c.orders.length}</span>
                </h2>
                <ul className="space-y-2">
                  {c.orders.map((o) => (
                    <li key={o.id}>
                      <DeliveryCard order={o} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </Screen>
  );
}

function DeliveryCard({ order }: { order: Order }) {
  const { t, i18n } = useTranslation('delivery');
  const locale = localeFor(i18n.language);
  const d = order.delivery;
  if (!d) return null;
  const charge = deliveryCharge(order);
  const open = d.status !== 'DELIVERED' && d.status !== 'CANCELLED';
  return (
    <Card className="gap-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/sales/deliveries/${order.id}`}
            className="inline-flex items-center font-semibold underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {order.number}
          </Link>
          <p className="text-sm font-medium">{order.customer?.name ?? formatPhone(d.phone)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <MoneyText value={order.totals.total} locale={locale} className="font-semibold" />
          <StatusBadge tone={order.status === 'PAID' ? 'success' : 'warning'} size="sm">
            {order.status === 'PAID' ? t('card.paid') : t('card.cod')}
          </StatusBadge>
        </div>
      </div>
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> {d.address}
      </p>
      {d.instructions && <p className="text-xs italic">“{d.instructions}”</p>}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {charge && (
          <span>
            {t('card.charge')} <MoneyText value={charge} locale={locale} />
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <BikeIcon className="size-3.5" aria-hidden />
          {d.riderName ?? t('card.noRider')}
        </span>
        {open && <span>{t('card.age', { time: formatElapsed(order.createdAt) })}</span>}
      </p>
      {open && <DeliveryActions order={order} />}
    </Card>
  );
}
