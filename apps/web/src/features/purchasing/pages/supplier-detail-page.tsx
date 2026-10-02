import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  MoneyText,
  PageHeader,
  PageSkeleton,
  StatCard,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { formatDate, formatPhone } from '@rbp/utils';
import {
  CalendarClockIcon,
  ClipboardListIcon,
  MailIcon,
  MapPinIcon,
  PackageCheckIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  PowerIcon,
  StickyNoteIcon,
  UserIcon,
  WalletIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useGoodsReceipts,
  usePurchaseOrders,
  useSetSupplierActive,
  useSupplier,
} from '../api/queries';
import { GoodsReceiptTable } from '../components/goods-receipt-table';
import { PurchaseOrderTable } from '../components/purchase-order-table';

/** PUR-002 Supplier detail: contact and terms, what's on order, what has arrived. */
export function SupplierDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const supplier = useSupplier(id);
  const orders = usePurchaseOrders({ supplierId: id ?? '', pageSize: 10 }, !!id);
  const receipts = useGoodsReceipts({ supplierId: id ?? '', pageSize: 5 }, !!id);
  const setActive = useSetSupplierActive();
  const [confirm, setConfirm] = useState(false);
  useBreadcrumbTitle(supplier.data?.name);

  if (supplier.isError) {
    return <QueryError error={supplier.error} onRetry={() => supplier.refetch()} />;
  }
  if (!supplier.data) return <PageSkeleton />;
  const s = supplier.data;
  const lastDelivery = receipts.data?.items[0]?.receivedAt;

  const toggle = () =>
    setActive.mutate(
      { id: s.id, isActive: !s.isActive },
      {
        onSuccess: (next) => {
          setConfirm(false);
          toast.success(
            t(next.isActive ? 'supplier.activated' : 'supplier.deactivated', { name: next.name }),
          );
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Screen id="PUR-002" title={s.name} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.name}
            <span className="font-mono text-sm font-normal text-muted-foreground">{s.code}</span>
            {!s.isActive && <StatusBadge tone="neutral">{t('suppliers.inactive')}</StatusBadge>}
          </span>
        }
        actions={
          s.isActive && (
            <Button asChild>
              <Link to={`/purchasing/orders/new?${new URLSearchParams({ supplierId: s.id })}`}>
                <PlusIcon /> {t('supplier.newOrder')}
              </Link>
            </Button>
          )
        }
        secondaryActions={[
          {
            id: 'edit',
            label: t('supplier.edit'),
            icon: <PencilIcon />,
            onSelect: () => navigate('edit'),
          },
          {
            id: 'active',
            label: t(s.isActive ? 'supplier.deactivate' : 'supplier.activate'),
            icon: <PowerIcon />,
            destructive: s.isActive,
            onSelect: () => setConfirm(true),
          },
        ]}
        moreLabel={t('more')}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('fields.openOrders')}
          value={String(s.openOrders)}
          icon={ClipboardListIcon}
          hint={t('supplier.openHint')}
        />
        <StatCard
          label={t('fields.totalReceived')}
          value={<MoneyText value={s.totalReceived} locale={locale} />}
          icon={WalletIcon}
        />
        <StatCard
          label={t('supplier.lastDelivery')}
          value={lastDelivery ? formatDate(lastDelivery, { locale }) : t('suppliers.never')}
          icon={PackageCheckIcon}
        />
      </div>

      <div className="space-y-section">
        <div className="space-y-section">
          <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail icon={UserIcon} label={t('fields.contactName')}>
              {s.contactName ?? <None />}
            </Detail>
            <Detail icon={PhoneIcon} label={t('fields.phone')}>
              {s.phone ? (
                <a
                  href={`tel:${s.phone}`}
                  className="inline-flex items-center font-medium tabular hover:underline pointer-coarse:min-h-11"
                >
                  {formatPhone(s.phone)}
                </a>
              ) : (
                <None />
              )}
            </Detail>
            <Detail icon={MailIcon} label={t('fields.email')}>
              {s.email ? (
                <a
                  href={`mailto:${s.email}`}
                  className="inline-flex items-center font-medium break-all hover:underline pointer-coarse:min-h-11"
                >
                  {s.email}
                </a>
              ) : (
                <None />
              )}
            </Detail>
            <Detail icon={CalendarClockIcon} label={t('fields.paymentTerms')}>
              {s.paymentTermsDays === 0
                ? t('supplier.cod')
                : t('supplier.termsDays', { count: s.paymentTermsDays })}
            </Detail>
            <Detail icon={MapPinIcon} label={t('fields.address')}>
              {s.address ?? <None />}
            </Detail>
            <Detail icon={StickyNoteIcon} label={t('fields.note')}>
              {s.note ?? <None />}
            </Detail>
          </Card>

          <section className="space-y-3" aria-labelledby="supplier-orders">
            <h2 id="supplier-orders" className="text-lg font-semibold">
              {t('supplier.orders')}
            </h2>
            <Card className="p-0">
              <PurchaseOrderTable
                caption={t('supplier.orders')}
                rows={orders.data?.items}
                loading={orders.isPending}
                showSupplier={false}
                error={
                  orders.isError ? (
                    <QueryError error={orders.error} onRetry={() => orders.refetch()} />
                  ) : undefined
                }
                empty={<EmptyState icon={ClipboardListIcon} title={t('supplier.noOrders')} />}
              />
            </Card>
          </section>

          <section className="space-y-3" aria-labelledby="supplier-receipts">
            <h2 id="supplier-receipts" className="text-lg font-semibold">
              {t('supplier.receipts')}
            </h2>
            <Card className="p-0">
              <GoodsReceiptTable
                caption={t('supplier.receipts')}
                rows={receipts.data?.items}
                loading={receipts.isPending}
                showSupplier={false}
                error={
                  receipts.isError ? (
                    <QueryError error={receipts.error} onRetry={() => receipts.refetch()} />
                  ) : undefined
                }
                empty={<EmptyState icon={PackageCheckIcon} title={t('supplier.noReceipts')} />}
              />
            </Card>
          </section>
        </div>
        <EntityHistory entity="supplier" entityId={s.id} />
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t(s.isActive ? 'supplier.deactivateTitle' : 'supplier.activateTitle', {
          name: s.name,
        })}
        description={t(s.isActive ? 'supplier.deactivateHint' : 'supplier.activateHint')}
        confirmLabel={t(s.isActive ? 'supplier.deactivate' : 'supplier.activate')}
        cancelLabel={t('cancel')}
        destructive={s.isActive}
        loading={setActive.isPending}
        onConfirm={toggle}
      />
    </Screen>
  );
}

function None() {
  const { t } = useTranslation('purchasing');
  return <span className="text-muted-foreground">{t('supplier.none')}</span>;
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof PhoneIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}
