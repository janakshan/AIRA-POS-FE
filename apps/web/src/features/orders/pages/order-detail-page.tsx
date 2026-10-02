import type { Money, OrderLine } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  MoneyText,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { ReceiptTextIcon, RotateCcwIcon, XCircleIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useCancelOrder, useOrder, useVoidOrder } from '@/features/pos/api/orders';
import { ReceiptDialog, type ReceiptTarget } from '@/features/pos/components/receipt-dialog';
import { ReturnDialog } from '@/features/pos/components/return-dialog';
import { ORDER_TONE, returnable, voidBlock } from '@/features/pos/lib/order-rules';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';

/**
 * SAL-001 one order: items, totals, payments, returns and who approved a cancel/void.
 * Reprint (POS-009), return (POS-011) and void/cancel (POS-012) use the POS dialogs and PIN rules.
 */
export function OrderDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('orders');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const { nameOf } = useMyLocations();
  const order = useOrder(id);
  const voidOrder = useVoidOrder();
  const cancelOrder = useCancelOrder();
  const [receipt, setReceipt] = useState<ReceiptTarget | null>(null);
  const [returning, setReturning] = useState(false);
  useBreadcrumbTitle(order.data?.number);

  if (order.isError) return <QueryError error={order.error} onRetry={() => order.refetch()} />;
  if (!order.data) return <PageSkeleton />;
  const o = order.data;
  const m = (v: Money) => formatMoney(v, locale);
  const block = o.status === 'PAID' ? voidBlock(o) : null;
  const unpaid = o.status === 'OPEN' || o.status === 'HELD';
  // A-230: food already in the kitchen needs a disposition, which only the POS asks for.
  const inKitchen = o.lines.some((l) => l.sentQuantity > 0);

  const doVoid = async () => {
    const verification = await confirmSensitive('pos.invoice.void', {
      reasonTitle: t('void.title', { number: o.number }),
      reasonDescription: t('void.description'),
      summary: `${o.number} · ${m(o.totals.total)}`,
    });
    if (!verification) return;
    voidOrder.mutate(
      { id: o.id, body: { verification } },
      {
        onSuccess: (v) =>
          toast.success(t('void.done', { number: v.number, amount: m(v.totals.total) })),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const doCancel = async () => {
    const verification = await confirmSensitive('pos.order.cancel', {
      reasonTitle: t('cancel.title', { number: o.number }),
      reasonDescription: t('cancel.description'),
      summary: `${o.number} · ${m(o.totals.total)}`,
    });
    if (!verification) return;
    cancelOrder.mutate(
      { id: o.id, body: { verification } },
      {
        onSuccess: (v) => toast.success(t('cancel.done', { number: v.number })),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const columns: DataTableColumn<OrderLine>[] = [
    {
      id: 'item',
      header: t('detail.item'),
      primary: true,
      cell: (l) => (
        <span>
          <span className="font-medium">{l.name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{l.code}</span>
          {l.note && (
            <span className="block text-xs text-muted-foreground">
              {t('detail.note', { note: l.note })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'qty',
      header: t('detail.qty'),
      align: 'right',
      width: 'w-36',
      cell: (l) => (
        <span className="tabular">
          <span className="font-semibold">{l.quantity}</span>
          {l.cancelledQuantity > 0 && (
            <span className="block text-xs text-muted-foreground">
              {t('detail.cancelledQty', { count: l.cancelledQuantity })}
            </span>
          )}
          {l.returnedQuantity > 0 && (
            <span className="block text-xs text-status-warning-fg">
              {t('detail.returnedQty', { count: l.returnedQuantity })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'price',
      header: t('detail.unitPrice'),
      align: 'right',
      width: 'w-32',
      hideOnTablet: true,
      cell: (l) => <MoneyText value={l.unitPrice} locale={locale} />,
    },
    {
      id: 'amount',
      header: t('detail.lineTotal'),
      align: 'right',
      width: 'w-36',
      cell: (l) => (
        <MoneyText
          value={{ ...l.unitPrice, amount: l.unitPrice.amount * l.quantity }}
          locale={locale}
          className="font-medium"
        />
      ),
    },
  ];

  const showVoid = o.status === 'PAID';
  const showCancel = unpaid && !inKitchen;

  return (
    <Screen id="SAL-001" title={o.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.number}
            <StatusBadge tone={ORDER_TONE[o.status]}>{t(`status.${o.status}`)}</StatusBadge>
            {o.returns.length > 0 && (
              <StatusBadge tone="warning">
                {t('returnsCount', { count: o.returns.length })}
              </StatusBadge>
            )}
          </span>
        }
        description={t('detail.subtitle', {
          type: t(`pos:orderType.${o.type}`),
          location: nameOf(o.locationId),
        })}
        actions={
          <div className="flex flex-wrap gap-2">
            {(o.status === 'PAID' || o.status === 'VOIDED') && (
              <Button variant="outline" onClick={() => setReceipt({ orderId: o.id })}>
                <ReceiptTextIcon /> {t('actions.receipt')}
              </Button>
            )}
            {returnable(o) && (
              <Button variant="outline" onClick={() => setReturning(true)}>
                <RotateCcwIcon /> {t('actions.return')}
              </Button>
            )}
            {showVoid && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={!!block || voidOrder.isPending}
                onClick={() => void doVoid()}
              >
                <XCircleIcon /> {t('actions.void')}
              </Button>
            )}
            {showCancel && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={cancelOrder.isPending}
                onClick={() => void doCancel()}
              >
                <XCircleIcon /> {t('actions.cancel')}
              </Button>
            )}
          </div>
        }
      />

      {o.cancellation && (
        <Alert
          tone="danger"
          title={t('detail.cancelledTitle', {
            status: t(`status.${o.status}`),
            name: o.cancellation.approvedBy.fullName,
          })}
        >
          {t('detail.cancelledReason', {
            reason: o.cancellation.reason.label,
            at: formatDateTime(o.cancellation.at, { locale }),
          })}
        </Alert>
      )}
      {block && <Alert tone="info">{t(`blocked.${block}`)}</Alert>}
      {unpaid && inKitchen && <Alert tone="info">{t('blocked.kitchen')}</Alert>}

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('detail.customer')}>
          {o.customer ? (
            <Link
              to={`/customers/${o.customer.id}`}
              className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {o.customer.name}
            </Link>
          ) : (
            t('walkIn')
          )}
          {o.customer?.phone && (
            <span className="block text-xs text-muted-foreground">{o.customer.phone}</span>
          )}
        </Fact>
        <Fact label={t('detail.createdBy')}>
          {formatDateTime(o.createdAt, { locale })}
          <span className="block text-xs text-muted-foreground">{o.createdBy}</span>
        </Fact>
        {o.paidAt && <Fact label={t('detail.paidAt')}>{formatDateTime(o.paidAt, { locale })}</Fact>}
        {o.heldAt && o.status === 'HELD' && (
          <Fact label={t('detail.heldAt')}>
            {formatDateTime(o.heldAt, { locale })}
            {o.holdLabel && (
              <span className="block text-xs text-muted-foreground">{o.holdLabel}</span>
            )}
          </Fact>
        )}
        {o.table && <Fact label={t('detail.table')}>{o.table.name}</Fact>}
        {o.delivery && (
          <Fact label={t('detail.delivery')}>
            {o.delivery.address}
            <span className="block text-xs text-muted-foreground">
              {o.delivery.phone} · {t(`pos:delivery.status.${o.delivery.status}`)}
            </span>
          </Fact>
        )}
        <Fact label={t('detail.total')}>
          <MoneyText value={o.totals.total} locale={locale} className="font-semibold" />
        </Fact>
      </Card>

      <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="p-0">
          <DataTable
            caption={t('detail.lines')}
            columns={columns}
            rows={o.lines.filter((l) => l.quantity > 0 || l.cancelledQuantity > 0)}
            getRowId={(l) => l.id}
            getRowLabel={(l) => l.name}
            loading={false}
          />
        </Card>

        <div className="space-y-section">
          <Section title={t('detail.totals')}>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <Row label={t('detail.subtotal')} value={m(o.totals.subtotal)} />
              {o.totals.discountTotal.amount > 0 && (
                <Row label={t('detail.discounts')} value={`−${m(o.totals.discountTotal)}`} />
              )}
              {o.totals.serviceCharge.amount > 0 && (
                <Row label={t('detail.serviceCharge')} value={m(o.totals.serviceCharge)} />
              )}
              {o.totals.charges.map((c) => (
                <Row key={c.id} label={c.label} value={m(c.amount)} />
              ))}
              {o.totals.tax.amount > 0 && <Row label={t('detail.tax')} value={m(o.totals.tax)} />}
              <dt className="border-t pt-1 font-semibold">{t('detail.total')}</dt>
              <dd className="border-t pt-1 text-right font-semibold tabular">
                {m(o.totals.total)}
              </dd>
            </dl>
          </Section>

          <Section title={t('detail.payments')}>
            {o.payments.length ? (
              <ul className="space-y-2 text-sm">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span>
                      {t(`method.${p.method}`)}
                      {p.kind === 'REFUND' && ` · ${t('detail.refund')}`}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(p.createdAt, { locale })} · {p.createdBy}
                      </span>
                      {p.tendered && p.change && (
                        <span className="block text-xs text-muted-foreground">
                          {t('detail.tendered', { tendered: m(p.tendered), change: m(p.change) })}
                        </span>
                      )}
                    </span>
                    <span className="tabular">
                      {p.kind === 'REFUND' ? '−' : ''}
                      {m(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('detail.noPayments')}</p>
            )}
          </Section>

          {o.returns.length > 0 && (
            <Section title={t('detail.returns')}>
              <ul className="space-y-3 text-sm">
                {o.returns.map((r) => (
                  <li key={r.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.number}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReceipt({ orderId: o.id, returnId: r.id })}
                        aria-label={`${t('detail.returnReceipt')} ${r.number}`}
                      >
                        <ReceiptTextIcon /> {t('detail.returnReceipt')}
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      {r.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('detail.returnBy', {
                        amount: m(r.amount),
                        method: t(`method.${r.refundMethod}`),
                        name: r.approval.approvedBy.fullName,
                        reason: r.approval.reason.label,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <EntityHistory entity="order" entityId={o.id} />

      <ReceiptDialog target={receipt} onOpenChange={(open) => !open && setReceipt(null)} />
      <ReturnDialog
        orderId={returning ? o.id : null}
        onOpenChange={(open) => !open && setReturning(false)}
        onDone={(done, returnId) => {
          setReturning(false);
          setReceipt({ orderId: done.id, returnId });
        }}
      />
    </Screen>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular">{value}</dd>
    </>
  );
}
