import { isApiError } from '@rbp/api-client';
import type { Order, Permission } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  MoneyText,
  PageHeader,
  PageSkeleton,
  StatusBadge,
} from '@rbp/ui';
import { cn, formatDateTime, formatMoney, formatPhone } from '@rbp/utils';
import { CheckIcon, MapPinIcon, PhoneIcon, PrinterIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { AccessDenied } from '@/components/access-denied';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMe } from '@/features/auth/api/queries';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useDelivery } from '../api/queries';
import { DeliveryActions } from '../components/delivery-actions';
import { DeliveryStatusBadge } from '../components/delivery-status-badge';
import { BOARD, deliveryCharge } from '../lib/status';

/**
 * DEL-002 Delivery: who, where, instructions, what's in the bag (with the delivery charge),
 * whether it's paid, the status timeline, and the next step (DEL-003/004).
 */
export function DeliveryDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('delivery');
  const locale = localeFor(i18n.language);
  const delivery = useDelivery(id);
  const { data: me } = useMe();
  useBreadcrumbTitle(delivery.data?.number);

  // A rider opening someone else's delivery (or a role without delivery access) gets the
  // standard 403 page, not a retryable error.
  if (isApiError(delivery.error) && delivery.error.code === 'FORBIDDEN') {
    const permission = delivery.error.details?.permission;
    return typeof permission === 'string' ? (
      <AccessDenied
        result={{ allowed: false, reason: 'permission', permission: permission as Permission }}
      />
    ) : (
      <AccessDenied description={t('detail.notYours')} />
    );
  }
  if (delivery.isError)
    return <QueryError error={delivery.error} onRetry={() => delivery.refetch()} />;
  if (!delivery.data) return <PageSkeleton />;
  const o = delivery.data;
  const d = o.delivery;
  if (!d) return <QueryError error={new Error('Not a delivery')} />;
  const charge = deliveryCharge(o);
  const reached = new Map((d.history ?? []).map((h) => [h.status, h]));
  const link =
    'inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11';

  return (
    <Screen id="DEL-002" title={o.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.number}
            <span className="text-sm font-normal">
              <DeliveryStatusBadge status={d.status} size="md" />
            </span>
          </span>
        }
        description={o.customer?.name ?? formatPhone(d.phone)}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              if (!navigator.userAgent.includes('jsdom')) window.print();
            }}
          >
            <PrinterIcon /> {t('detail.print')}
          </Button>
        }
      />
      {d.status === 'CANCELLED' && <Alert tone="danger" title={t('detail.cancelled')} />}
      {d.status !== 'CANCELLED' && d.status !== 'DELIVERED' && (
        <Card className="p-4">
          <DeliveryActions order={o} size="pos" full />
        </Card>
      )}

      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-section">
          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <Fact label={t('fields.phone')}>
              <a href={`tel:${d.phone}`} className={link}>
                <PhoneIcon className="size-4" aria-hidden /> {formatPhone(d.phone)}
              </a>
            </Fact>
            <Fact label={t('fields.rider')}>
              {d.riderName ?? <span className="text-muted-foreground">{t('card.noRider')}</span>}
            </Fact>
            <div className="sm:col-span-2">
              <Fact label={t('fields.address')}>
                <span className="inline-flex items-start gap-1.5">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> {d.address}
                </span>
              </Fact>
            </div>
            {d.instructions && (
              <div className="sm:col-span-2">
                <Fact label={t('fields.instructions')}>{d.instructions}</Fact>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {o.lines
                  .filter((l) => l.quantity > 0)
                  .map((l) => (
                    <li key={l.id} className="flex justify-between gap-2 py-2">
                      <span>
                        {l.quantity} × {l.name}
                        {l.note && (
                          <span className="block text-xs text-muted-foreground">{l.note}</span>
                        )}
                      </span>
                      <span className="tabular">
                        {formatMoney(
                          {
                            amount: l.unitPrice.amount * l.quantity,
                            currency: l.unitPrice.currency,
                          },
                          locale,
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 border-t pt-3 text-sm">
                <dt>{t('detail.subtotal')}</dt>
                <dd className="text-right tabular">
                  <MoneyText value={o.totals.subtotal} locale={locale} />
                </dd>
                {charge && (
                  <>
                    <dt>{t('detail.charge')}</dt>
                    <dd className="text-right tabular">
                      <MoneyText value={charge} locale={locale} />
                    </dd>
                  </>
                )}
                {o.totals.tax.amount > 0 && (
                  <>
                    <dt>{t('detail.tax')}</dt>
                    <dd className="text-right tabular">
                      <MoneyText value={o.totals.tax} locale={locale} />
                    </dd>
                  </>
                )}
                <dt className="font-semibold">{t('detail.total')}</dt>
                <dd className="text-right font-semibold tabular">
                  <MoneyText value={o.totals.total} locale={locale} />
                </dd>
              </dl>
              <p className="mt-3">
                <StatusBadge tone={o.status === 'PAID' ? 'success' : 'warning'} size="md">
                  {o.status === 'PAID'
                    ? t('detail.paidBy', {
                        method: t(`method.${o.payments[0]?.method ?? 'CASH'}`),
                      })
                    : t('detail.collect', { amount: formatMoney(o.totals.total, locale) })}
                </StatusBadge>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('detail.timeline')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3" aria-label={t('detail.timeline')}>
              {BOARD.map((s) => {
                const h = reached.get(s);
                return (
                  <li key={s} className="flex gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
                        h
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                      aria-hidden
                    >
                      {h && <CheckIcon className="size-3.5" />}
                    </span>
                    <div className="text-sm">
                      <p className={cn('font-medium', !h && 'text-muted-foreground')}>
                        {t(`status.${s}`)}
                      </p>
                      {h && (
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(h.at, { locale })} · {h.by}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      <DispatchSlip order={o} business={me?.tenant.name ?? ''} />
    </Screen>
  );
}

/** Printed only: what the rider takes with the bag. */
function DispatchSlip({ order, business }: { order: Order; business: string }) {
  const { t, i18n } = useTranslation('delivery');
  const locale = localeFor(i18n.language);
  const d = order.delivery;
  if (!d) return null;
  return (
    <article
      data-print-root
      aria-hidden
      className="hidden font-mono text-[13px] leading-snug text-neutral-900 print:block"
    >
      <p className="text-center font-bold">{business}</p>
      <p className="text-center">{t('slip.title')}</p>
      <hr className="my-2 border-dashed" />
      <p className="font-bold">{order.number}</p>
      <p>{order.customer?.name}</p>
      <p>{formatPhone(d.phone)}</p>
      <p>{d.address}</p>
      {d.instructions && <p>“{d.instructions}”</p>}
      <hr className="my-2 border-dashed" />
      {order.lines.map((l) => (
        <p key={l.id}>
          {l.quantity} × {l.name}
        </p>
      ))}
      <hr className="my-2 border-dashed" />
      <p className="font-bold">
        {order.status === 'PAID'
          ? t('slip.paid')
          : t('slip.collect', { amount: formatMoney(order.totals.total, locale) })}
      </p>
      {d.riderName && <p>{t('slip.rider', { name: d.riderName })}</p>}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="break-words">{children}</div>
    </div>
  );
}
