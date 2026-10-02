import type { PurchaseOrderLine } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  PageHeader,
  PageSkeleton,
  Textarea,
  toast,
} from '@rbp/ui';
import { cn, formatDateTime } from '@rbp/utils';
import { PackageCheckIcon, PencilIcon, SendIcon, XCircleIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCancelPurchaseOrder,
  useGoodsReceipts,
  usePlacePurchaseOrder,
  usePurchaseOrder,
} from '../api/queries';
import { GoodsReceiptTable } from '../components/goods-receipt-table';
import { PoStatusBadge } from '../components/po-status-badge';
import { formatPlainDate, isOpen, outstanding } from '../lib/status';
import { usePurchasingErrorMessage } from '../lib/use-purchasing-error';

/** PUR-003 purchase order: lines with ordered / received / to come, and its deliveries. */
export function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const errorMessage = usePurchasingErrorMessage();
  const { nameOf } = useMyLocations();
  const order = usePurchaseOrder(id);
  const receipts = useGoodsReceipts({ purchaseOrderId: id ?? '' }, !!id);
  const place = usePlacePurchaseOrder();
  const cancel = useCancelPurchaseOrder();
  const reasonId = useId();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  // The confirm button can't be disabled, so a short reason turns the hint into an error.
  const [reasonTried, setReasonTried] = useState(false);
  useBreadcrumbTitle(order.data?.number);

  if (order.isError) return <QueryError error={order.error} onRetry={() => order.refetch()} />;
  if (!order.data) return <PageSkeleton />;
  const po = order.data;
  const currency = po.total.currency;
  const canCancel = (po.status === 'DRAFT' || po.status === 'ORDERED') && !po.receiptIds.length;

  const doPlace = () =>
    place.mutate(po.id, {
      onSuccess: (p) => toast.success(t('order.placedToast', { number: p.number })),
      onError: (e) => toast.error(errorMessage(e)),
    });
  const doCancel = () =>
    cancel.mutate(
      { id: po.id, body: { reason: reason.trim() } },
      {
        onSuccess: (p) => {
          setCancelling(false);
          toast.success(t('order.cancelledToast', { number: p.number }));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const columns: DataTableColumn<PurchaseOrderLine>[] = [
    {
      id: 'item',
      header: t('fields.item'),
      primary: true,
      cell: (l) => (
        <span>
          <span className="font-medium">{l.productName}</span>
          <span className="block font-mono text-xs text-muted-foreground">{l.productCode}</span>
        </span>
      ),
    },
    {
      id: 'ordered',
      header: t('fields.ordered'),
      align: 'right',
      width: 'w-24',
      cell: (l) => (
        <span className="tabular">
          {l.quantity}{' '}
          <span className="text-xs text-muted-foreground">
            {t(`inventory:unit.${l.unit}`, { count: l.quantity })}
          </span>
        </span>
      ),
    },
    {
      id: 'received',
      header: t('fields.received'),
      align: 'right',
      width: 'w-24',
      cell: (l) => <span className="tabular">{l.receivedQuantity}</span>,
    },
    {
      id: 'toCome',
      header: t('fields.toCome'),
      align: 'right',
      width: 'w-24',
      cell: (l) => {
        const left = outstanding(l);
        return (
          <span
            className={cn(
              'font-semibold tabular',
              left > 0 && isOpen(po) ? 'text-status-warning-fg' : 'text-muted-foreground',
            )}
          >
            {po.status === 'CANCELLED' ? '—' : left}
          </span>
        );
      },
    },
    {
      id: 'cost',
      header: t('fields.unitCost'),
      align: 'right',
      width: 'w-32',
      cell: (l) => <MoneyText value={l.unitCost} locale={locale} />,
    },
    {
      id: 'total',
      header: t('fields.lineTotal'),
      align: 'right',
      width: 'w-36',
      cell: (l) => (
        <MoneyText
          value={{ amount: l.quantity * l.unitCost.amount, currency }}
          locale={locale}
          className="font-medium"
        />
      ),
    },
  ];

  const primary =
    po.status === 'DRAFT' ? (
      <Button onClick={doPlace} loading={place.isPending}>
        <SendIcon /> {t('order.place')}
      </Button>
    ) : isOpen(po) ? (
      <Button asChild>
        <Link to={`/purchasing/receiving/new?${new URLSearchParams({ po: po.id })}`}>
          <PackageCheckIcon /> {t('order.receive')}
        </Link>
      </Button>
    ) : null;

  return (
    <Screen id="PUR-003" title={po.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {po.number}
            <span className="text-sm font-normal">
              <PoStatusBadge order={po} size="md" />
            </span>
          </span>
        }
        description={t('order.subtitle', {
          supplier: po.supplierName,
          location: nameOf(po.locationId),
        })}
        actions={primary}
        secondaryActions={[
          ...(po.status === 'DRAFT'
            ? [
                {
                  id: 'edit',
                  label: t('order.edit'),
                  icon: <PencilIcon />,
                  onSelect: () => navigate('edit'),
                },
              ]
            : []),
          ...(canCancel
            ? [
                {
                  id: 'cancel',
                  label: t('order.cancel'),
                  icon: <XCircleIcon />,
                  destructive: true,
                  onSelect: () => {
                    setReason('');
                    setReasonTried(false);
                    setCancelling(true);
                  },
                },
              ]
            : []),
        ]}
        moreLabel={t('more')}
      />

      {po.status === 'CANCELLED' && (
        <Alert tone="danger" title={t('order.cancelledTitle')}>
          {t('order.cancelledBy', {
            name: po.cancelledBy ?? '',
            at: po.cancelledAt ? formatDateTime(po.cancelledAt, { locale }) : '',
          })}
          {po.cancelReason && ` — ${po.cancelReason}`}
        </Alert>
      )}
      {po.status === 'DRAFT' && (
        <Alert tone="info" title={t('order.draftTitle')}>
          {t('order.draftHint')}
        </Alert>
      )}

      <div className="space-y-section">
        <div className="space-y-section">
          <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t('fields.supplier')}>
              <Link
                to={`/purchasing/suppliers/${po.supplierId}`}
                className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
              >
                {po.supplierName}
              </Link>
            </Fact>
            <Fact label={t('fields.deliverTo')}>{nameOf(po.locationId)}</Fact>
            <Fact label={t('fields.expected')}>
              {po.expectedDate ? formatPlainDate(po.expectedDate, locale) : '—'}
            </Fact>
            <Fact label={t('fields.total')}>
              <MoneyText value={po.total} locale={locale} className="font-semibold" />
            </Fact>
            <Fact label={t('order.created')}>
              {formatDateTime(po.createdAt, { locale })}
              <span className="block text-xs text-muted-foreground">{po.createdBy}</span>
            </Fact>
            <Fact label={t('order.ordered')}>
              {po.orderedAt ? formatDateTime(po.orderedAt, { locale }) : '—'}
            </Fact>
            {po.note && (
              <div className="sm:col-span-2">
                <Fact label={t('fields.note')}>{po.note}</Fact>
              </div>
            )}
          </Card>

          <Card className="p-0">
            <DataTable
              caption={t('order.lines')}
              columns={columns}
              rows={po.lines}
              getRowId={(l) => l.productId}
              getRowLabel={(l) => l.productName}
              loading={false}
            />
          </Card>

          <section className="space-y-3" aria-labelledby="po-receipts">
            <h2 id="po-receipts" className="text-lg font-semibold">
              {t('order.receipts')}
            </h2>
            <Card className="p-0">
              <GoodsReceiptTable
                caption={t('order.receipts')}
                rows={receipts.data?.items}
                loading={receipts.isPending}
                showSupplier={false}
                error={
                  receipts.isError ? (
                    <QueryError error={receipts.error} onRetry={() => receipts.refetch()} />
                  ) : undefined
                }
                empty={
                  <EmptyState
                    icon={PackageCheckIcon}
                    title={t('order.noReceipts')}
                    description={isOpen(po) ? t('order.noReceiptsHint') : undefined}
                  />
                }
              />
            </Card>
          </section>
        </div>
        <EntityHistory entity="purchase-order" entityId={po.id} />
      </div>

      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('order.cancelTitle', { number: po.number })}
        description={t('order.cancelHint')}
        confirmLabel={t('order.cancel')}
        cancelLabel={t('order.keep')}
        destructive
        loading={cancel.isPending}
        onConfirm={() => (reason.trim().length >= 3 ? doCancel() : setReasonTried(true))}
      >
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {t('order.cancelReason')}
          </label>
          <Textarea
            id={reasonId}
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={reasonTried && reason.trim().length < 3}
            aria-describedby={reason.trim().length < 3 ? `${reasonId}-hint` : undefined}
            placeholder={t('order.cancelReasonPlaceholder')}
          />
          {reason.trim().length < 3 && (
            <p
              id={`${reasonId}-hint`}
              role={reasonTried ? 'alert' : undefined}
              className={reasonTried ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}
            >
              {t('common:validation.cancelReasonRequired')}
            </p>
          )}
        </div>
      </ConfirmDialog>
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
