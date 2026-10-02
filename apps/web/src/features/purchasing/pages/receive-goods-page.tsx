import type { PurchaseOrder } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  MoneyText,
  NumberInput,
  PageHeader,
  PageSkeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { ArrowRightIcon, PackageCheckIcon, TruckIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useInventory } from '@/features/inventory/api/queries';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { usePurchaseOrder, usePurchaseOrders, useReceiveGoods } from '../api/queries';
import { PoStatusBadge } from '../components/po-status-badge';
import { formatPlainDate, isOpen, outstanding } from '../lib/status';

/** PUR-004 receive a delivery against a PO. Each item received is a PURCHASE stock movement. */
export function ReceiveGoodsPage() {
  const { t } = useTranslation('purchasing');
  const [params, setParams] = useSearchParams();
  const poId = params.get('po');
  const order = usePurchaseOrder(poId);
  useBreadcrumbTitle(t('receive.title'));

  return (
    <Screen id="PUR-004" title={t('receive.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          order.data ? t('receive.titleFor', { number: order.data.number }) : t('receive.title')
        }
        description={t('receive.hint')}
      />
      {!poId ? (
        <ChooseOrder onChoose={(id) => setParams({ po: id })} />
      ) : order.isError ? (
        <QueryError error={order.error} onRetry={() => order.refetch()} />
      ) : !order.data ? (
        <PageSkeleton />
      ) : !isOpen(order.data) ? (
        <Alert tone="info" title={t('receive.notOpen', { number: order.data.number })}>
          <Link
            to={`/purchasing/orders/${order.data.id}`}
            className="inline-flex items-center font-medium underline pointer-coarse:min-h-11"
          >
            {t('orderForm.openOrder')}
          </Link>
        </Alert>
      ) : (
        <ReceiveForm key={order.data.id} po={order.data} />
      )}
    </Screen>
  );
}

function ChooseOrder({ onChoose }: { onChoose: (id: string) => void }) {
  const { t } = useTranslation('purchasing');
  const open = usePurchaseOrders({ open: true, pageSize: 50 });
  const id = useId();
  if (open.isError) return <QueryError error={open.error} onRetry={() => open.refetch()} />;
  if (!open.data) return <PageSkeleton />;
  if (!open.data.items.length) {
    return <EmptyState icon={TruckIcon} title={t('receiving.nothingDue')} />;
  }
  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-2 pt-6">
        <label htmlFor={id} className="text-sm font-medium">
          {t('receive.choose')}
        </label>
        <Select onValueChange={onChoose}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={t('receive.choosePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {open.data.items.map((po) => (
              <SelectItem key={po.id} value={po.id}>
                {po.number} · {po.supplierName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

function ReceiveForm({ po }: { po: PurchaseOrder }) {
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { nameOf } = useMyLocations();
  const receive = useReceiveGoods();
  const stock = useInventory({ locationId: po.locationId, pageSize: 100 });
  const ids = { invoice: useId(), note: useId() };
  const [qty, setQty] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(po.lines.map((l) => [l.productId, outstanding(l)])),
  );
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');

  const onHandOf = (productId: string) =>
    stock.data?.items.find((s) => s.productId === productId)?.onHand ?? null;
  const got = (productId: string) => qty[productId] ?? 0;
  const totalUnits = po.lines.reduce((s, l) => s + got(l.productId), 0);
  const value = po.lines.reduce((s, l) => s + got(l.productId) * l.unitCost.amount, 0);
  const short = po.lines.reduce((s, l) => s + (outstanding(l) - got(l.productId)), 0);
  const invalid = po.lines.some((l) => got(l.productId) > outstanding(l));

  const submit = () =>
    receive.mutate(
      {
        id: po.id,
        body: {
          lines: po.lines.map((l) => ({
            productId: l.productId,
            receivedQuantity: got(l.productId),
          })),
          ...(invoice.trim() ? { supplierInvoiceRef: invoice.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: (grn) => {
          toast.success(
            t('receive.done', {
              number: grn.number,
              count: grn.lines.reduce((s, l) => s + l.receivedQuantity, 0),
              location: nameOf(grn.locationId),
            }),
          );
          navigate(`/purchasing/receiving/${grn.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-section">
        <Card className="flex-row flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span className="flex items-center gap-2">
            <Link
              to={`/purchasing/orders/${po.id}`}
              className="inline-flex items-center font-semibold underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {po.number}
            </Link>
            <PoStatusBadge order={po} />
          </span>
          <span>
            <span className="text-muted-foreground">{t('fields.supplier')}: </span>
            <span className="font-medium">{po.supplierName}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t('fields.deliverTo')}: </span>
            <span className="font-medium">{nameOf(po.locationId)}</span>
          </span>
          {po.expectedDate && (
            <span>
              <span className="text-muted-foreground">{t('fields.expected')}: </span>
              {formatPlainDate(po.expectedDate, locale)}
            </span>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('receive.lines')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-xl border" aria-label={t('receive.lines')}>
              {po.lines.map((l) => {
                const left = outstanding(l);
                const now = got(l.productId);
                const onHand = onHandOf(l.productId);
                const unit = (n: number) => t(`inventory:unit.${l.unit}`, { count: n });
                return (
                  <li
                    key={l.productId}
                    className={cn(
                      'grid items-center gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,12rem)]',
                      left === 0 && 'opacity-60',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{l.productName}</p>
                      <p className="text-xs text-muted-foreground tabular">
                        {t('receive.lineStatus', {
                          ordered: l.quantity,
                          received: l.receivedQuantity,
                          left,
                          unit: unit(l.quantity),
                        })}
                      </p>
                    </div>
                    {left > 0 ? (
                      <NumberInput
                        value={qty[l.productId] ?? null}
                        min={0}
                        max={left}
                        onChange={(v) => setQty((q) => ({ ...q, [l.productId]: v }))}
                        aria-label={t('receive.quantityFor', { name: l.productName })}
                        decrementLabel={t('orderForm.less', { name: l.productName })}
                        incrementLabel={t('orderForm.more', { name: l.productName })}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">{t('receive.complete')}</span>
                    )}
                    <p className="flex items-center gap-1.5 text-sm tabular sm:justify-end">
                      {onHand === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">{onHand}</span>
                          <ArrowRightIcon
                            className="size-3.5 text-muted-foreground"
                            aria-label={t('receive.becomes')}
                          />
                          <span
                            className={cn('font-semibold', now > 0 && 'text-status-success-fg')}
                          >
                            {onHand + now}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {unit(onHand + now)}
                          </span>
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('receive.stockHint', { location: nameOf(po.locationId) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={ids.invoice} className="text-sm font-medium">
                {t('fields.invoiceRef')}
              </label>
              <Input
                id={ids.invoice}
                value={invoice}
                maxLength={40}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder={t('receive.invoicePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.note} className="text-sm font-medium">
                {t('fields.note')}
              </label>
              <Input
                id={ids.note}
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('receive.notePlaceholder')}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="xl:sticky xl:top-4">
        <CardHeader>
          <CardTitle>{t('receive.summary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('receive.units')}</dt>
              <dd className="font-semibold tabular">{totalUnits}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('fields.value')}</dt>
              <dd>
                <MoneyText value={{ amount: value, currency: po.total.currency }} locale={locale} />
              </dd>
            </div>
          </dl>
          {short > 0 && totalUnits > 0 && (
            <Alert tone="warning" title={t('receive.partTitle')}>
              {t('receive.partHint', { count: short })}
            </Alert>
          )}
          <Button
            size="pos"
            className="w-full"
            disabled={totalUnits === 0 || invalid || receive.isPending}
            loading={receive.isPending}
            onClick={submit}
          >
            <PackageCheckIcon /> {t('receive.submit', { count: totalUnits })}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
