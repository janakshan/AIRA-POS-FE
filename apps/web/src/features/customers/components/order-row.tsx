import type { Order } from '@rbp/types';
import { StatusBadge } from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useLocationName } from '../lib/use-location-name';
import { ORDER_TONE } from '../lib/order-status';

/** One order in the customer's history; opens the order detail. */
export function OrderRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const { t, i18n } = useTranslation('customers');
  const locale = localeFor(i18n.language);
  const locationName = useLocationName();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('orders.open', { number: order.number })}
        className="flex min-h-touch w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left focus-ring hover:bg-accent/50"
      >
        <span className="font-semibold">{order.number}</span>
        <StatusBadge tone={ORDER_TONE[order.status]} size="sm">
          {t(`orders.status.${order.status}`)}
        </StatusBadge>
        {order.type !== 'RETAIL' && (
          <StatusBadge tone="neutral" size="sm" hideIcon>
            {t(`orders.type.${order.type}`)}
            {order.table && ` · ${order.table.name}`}
          </StatusBadge>
        )}
        {order.payments.some((p) => p.kind === 'SALE' && p.method === 'CREDIT') && (
          <StatusBadge tone="warning" size="sm" hideIcon>
            {t('orders.method.CREDIT')}
          </StatusBadge>
        )}
        <span className="text-sm text-muted-foreground">
          {formatDateTime(order.paidAt ?? order.createdAt, { locale })} ·{' '}
          {locationName(order.locationId)} · {t('orders.items', { count: order.totals.itemCount })}
        </span>
        <span className="ml-auto font-semibold tabular">
          {formatMoney(order.totals.total, locale)}
        </span>
      </button>
    </li>
  );
}
