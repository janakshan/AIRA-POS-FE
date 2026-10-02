import type { Order } from '@rbp/types';
import { ResponsiveDialog, StatusBadge } from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { ORDER_TONE } from '../lib/order-status';
import { useLocationName } from '../lib/use-location-name';

/**
 * CUS-004 read-only view of one past order (any location): items, totals, payments,
 * returns and who approved a cancel/void. Reprints stay on the POS of that location.
 */
export function OrderDetailDialog({
  order,
  onOpenChange,
}: {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('customers');
  const locale = localeFor(i18n.language);
  const locationName = useLocationName();
  const m = (v: Order['totals']['total']) => formatMoney(v, locale);

  return (
    <ResponsiveDialog
      open={!!order}
      onOpenChange={onOpenChange}
      title={order ? t('orders.detailTitle', { number: order.number }) : ' '}
      description={
        order
          ? `${formatDateTime(order.paidAt ?? order.createdAt, { locale })} · ${locationName(order.locationId)}`
          : undefined
      }
      closeLabel={t('common:actions.close')}
      size="md"
    >
      {order && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={ORDER_TONE[order.status]} size="sm">
              {t(`orders.status.${order.status}`)}
            </StatusBadge>
            {order.type !== 'RETAIL' && (
              <StatusBadge tone="neutral" size="sm" hideIcon>
                {t(`orders.type.${order.type}`)}
                {order.table && ` · ${order.table.name}`}
              </StatusBadge>
            )}
            <span className="text-muted-foreground">
              {t('orders.by', { name: order.createdBy })}
            </span>
          </div>
          <ul className="divide-y rounded-lg border">
            {order.lines
              .filter((l) => l.quantity > 0 || l.cancelledQuantity > 0)
              .map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-medium tabular">{l.quantity}</span> × {l.name}
                    {l.returnedQuantity > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {t('orders.returned', { count: l.returnedQuantity })}
                      </span>
                    )}
                  </span>
                  <span className="tabular">
                    {formatMoney(
                      { ...l.unitPrice, amount: l.unitPrice.amount * l.quantity },
                      locale,
                    )}
                  </span>
                </li>
              ))}
          </ul>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">{t('orders.subtotal')}</dt>
            <dd className="text-right tabular">{m(order.totals.subtotal)}</dd>
            {order.totals.serviceCharge.amount > 0 && (
              <>
                <dt className="text-muted-foreground">{t('orders.service')}</dt>
                <dd className="text-right tabular">{m(order.totals.serviceCharge)}</dd>
              </>
            )}
            {order.totals.tax.amount > 0 && (
              <>
                <dt className="text-muted-foreground">{t('orders.tax')}</dt>
                <dd className="text-right tabular">{m(order.totals.tax)}</dd>
              </>
            )}
            <dt className="font-semibold">{t('orders.total')}</dt>
            <dd className="text-right font-semibold tabular">{m(order.totals.total)}</dd>
          </dl>
          {order.payments.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-medium">{t('orders.payments')}</h3>
              <ul className="space-y-0.5">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span>
                      {t(`orders.method.${p.method}`)}
                      {p.kind === 'REFUND' && ` · ${t('orders.refund')}`}
                    </span>
                    <span className="tabular">
                      {p.kind === 'REFUND' ? '−' : ''}
                      {m(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {order.returns.map((r) => (
            <p key={r.id} className="rounded-lg bg-muted/60 px-3 py-2">
              {t('orders.returnLine', {
                number: r.number,
                amount: m(r.amount),
                name: r.approval.approvedBy.fullName,
                reason: r.approval.reason.label,
              })}
            </p>
          ))}
          {order.cancellation && (
            <p className="rounded-lg bg-status-danger/10 px-3 py-2">
              {t('orders.approval', {
                status: t(`orders.status.${order.status}`),
                name: order.cancellation.approvedBy.fullName,
                reason: order.cancellation.reason.label,
              })}
            </p>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
