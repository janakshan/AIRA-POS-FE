import type { DeliveryStatus, Order, OrderStatus } from '@rbp/types';
import {
  Button,
  EmptyState,
  FilterChip,
  ResponsiveDialog,
  SearchInput,
  Skeleton,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { BikeIcon, ReceiptTextIcon, RotateCcwIcon, SearchXIcon, XCircleIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useDeliveryStatus } from '@/features/restaurant/api/queries';
import { useOrders, useVoidOrder } from '../api/orders';
import { ORDER_TONE, returnable, startOfToday, voidBlock } from '../lib/order-rules';

/** Staff move a delivery on by hand; PREPARING/READY also follow the kitchen tickets. */
const NEXT_DELIVERY: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  NEW: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  // Assigning a rider and handing over happen on DEL-001 Deliveries.
};

/**
 * Today's sales at this location: receipt (reprint), return (POS-011) and void (POS-012).
 * Cancelled/voided sales stay listed with who approved it and why — nothing disappears.
 */
export function SalesHistoryDialog({
  open,
  onOpenChange,
  onReceipt,
  onReturn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceipt: (orderId: string) => void;
  onReturn: (orderId: string) => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const { data: me } = useMe();
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const voidOrder = useVoidOrder();
  const deliveryStatus = useDeliveryStatus();
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [search, setSearch] = useState('');
  const from = useMemo(() => startOfToday(), []);
  const orders = useOrders(
    {
      from,
      pageSize: 100,
      ...(status ? { status } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    },
    open,
  );

  const doVoid = async (o: Order) => {
    const verification = await confirmSensitive('pos.invoice.void', {
      reasonTitle: t('history.voidTitle', { number: o.number }),
      reasonDescription: t('history.voidDescription'),
      summary: `${o.number} · ${formatMoney(o.totals.total, locale)}`,
    });
    if (!verification) return;
    voidOrder.mutate(
      { id: o.id, body: { verification } },
      {
        onSuccess: (v) =>
          toast.success(
            t('history.voided', { number: v.number, amount: formatMoney(v.totals.total, locale) }),
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('history.title')}
      description={t('history.today', { location: me?.currentLocation?.name ?? '' })}
      closeLabel={t('closeSale')}
      size="xl"
    >
      <div data-screen-id="POS-012" className="space-y-3">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('history.search')}
          aria-label={t('history.search')}
          clearLabel={t('clear')}
        />
        <div className="-mx-1 scrollbar-none flex gap-2 overflow-x-auto px-1">
          {([null, 'PAID', 'HELD', 'CANCELLED', 'VOIDED'] as const).map((s) => (
            <FilterChip key={s ?? 'all'} active={status === s} onClick={() => setStatus(s)}>
              {t(`history.${s ?? 'all'}`)}
            </FilterChip>
          ))}
        </div>
        {orders.isPending ? (
          <Skeleton className="h-40" />
        ) : !orders.data?.items.length ? (
          <EmptyState icon={SearchXIcon} title={t('history.empty')} />
        ) : (
          <ul className="max-h-[55dvh] divide-y overflow-y-auto rounded-xl border">
            {orders.data.items.map((o) => {
              const block = voidBlock(o);
              return (
                <li key={o.id} className="space-y-2 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{o.number}</span>
                    <StatusBadge tone={ORDER_TONE[o.status]} size="sm">
                      {t(`history.${o.status}`)}
                    </StatusBadge>
                    {o.type !== 'RETAIL' && (
                      <StatusBadge tone="neutral" size="sm" hideIcon>
                        {t(`orderType.${o.type}`)}
                        {o.table && ` · ${o.table.name}`}
                      </StatusBadge>
                    )}
                    {o.delivery && (
                      <StatusBadge tone="info" size="sm">
                        {t(`delivery.status.${o.delivery.status}`)}
                      </StatusBadge>
                    )}
                    {o.returns.length > 0 && (
                      <StatusBadge tone="warning" size="sm">
                        {t('history.returnsCount', { count: o.returns.length })}
                      </StatusBadge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(o.paidAt ?? o.createdAt, { locale })}
                      {o.customer && ` · ${o.customer.name}`} ·{' '}
                      {t('history.items', { count: o.totals.itemCount })}
                    </span>
                    <span className="ml-auto font-semibold tabular">
                      {formatMoney(o.totals.total, locale)}
                    </span>
                  </div>
                  {o.cancellation && (
                    <p className="text-xs text-muted-foreground">
                      {t('history.approval', {
                        status: t(`history.${o.status}`),
                        name: o.cancellation.approvedBy.fullName,
                        reason: o.cancellation.reason.label,
                      })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={o.status !== 'PAID' && o.status !== 'VOIDED'}
                      onClick={() => onReceipt(o.id)}
                      aria-label={`${t('history.receipt')} ${o.number}`}
                    >
                      <ReceiptTextIcon /> {t('history.receipt')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!returnable(o)}
                      title={
                        o.status === 'PAID' && !returnable(o) ? t('history.cantReturn') : undefined
                      }
                      onClick={() => onReturn(o.id)}
                      aria-label={`${t('history.return')} ${o.number}`}
                    >
                      <RotateCcwIcon /> {t('history.return')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={o.status !== 'PAID' || !!block || voidOrder.isPending}
                      onClick={() => void doVoid(o)}
                      aria-label={`${t('history.void')} ${o.number}`}
                    >
                      <XCircleIcon /> {t('history.void')}
                    </Button>
                    {o.delivery &&
                      NEXT_DELIVERY[o.delivery.status] &&
                      o.status !== 'CANCELLED' &&
                      o.status !== 'VOIDED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deliveryStatus.isPending}
                          aria-label={`${t('delivery.markAs', {
                            status: t(`delivery.status.${NEXT_DELIVERY[o.delivery.status]}`),
                          })} ${o.number}`}
                          onClick={() => {
                            const status = o.delivery && NEXT_DELIVERY[o.delivery.status];
                            if (!status) return;
                            deliveryStatus.mutate(
                              { id: o.id, status },
                              { onError: (e) => toast.error(errorMessage(e)) },
                            );
                          }}
                        >
                          <BikeIcon />
                          {t('delivery.markAs', {
                            status: t(`delivery.status.${NEXT_DELIVERY[o.delivery.status]}`),
                          })}
                        </Button>
                      )}
                    {o.status === 'PAID' && block && (
                      <span className="self-center text-xs text-muted-foreground">
                        {t(block === 'returns' ? 'history.cantVoidReturns' : 'history.cantVoidDay')}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
