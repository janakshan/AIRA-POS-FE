import type { ShopLedgerEntry, WholesaleCollection, WholesaleReturn } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  type StatusTone,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@rbp/ui';
import { formatDateTime, formatPhone } from '@rbp/utils';
import {
  HandCoinsIcon,
  HistoryIcon,
  PencilIcon,
  PhoneIcon,
  ShoppingCartIcon,
  Undo2Icon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCollections,
  useInvoices,
  useReturns,
  useShop,
  useShopLedger,
  useWholesaleRoutes,
} from '../api/queries';
import { CollectionDialog } from '../components/collection-dialog';
import { CreditBar } from '../components/credit-bar';
import { InvoiceTable } from '../components/invoice-table';
import { ShopDialog } from '../components/shop-dialog';
import { useCanSell } from '../hooks/use-can-sell';

const KIND_TONE: Record<ShopLedgerEntry['kind'], StatusTone> = {
  OPENING: 'neutral',
  INVOICE: 'warning',
  COLLECTION: 'success',
  RETURN: 'info',
};

/**
 * WHO-002 Shop detail: the full record §25 asks for — contact, limit, outstanding, and its
 * sales, payment and return history — with the three field actions.
 */
export function ShopDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const shop = useShop(id);
  const routes = useWholesaleRoutes();
  const ledger = useShopLedger(id);
  const invoices = useInvoices({ shopId: id ?? '' }, !!id);
  const collections = useCollections({ shopId: id ?? '' }, !!id);
  const returns = useReturns({ shopId: id ?? '' }, !!id);
  const [editing, setEditing] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const canSell = useCanSell();
  useBreadcrumbTitle(shop.data?.name);

  if (shop.isError) return <QueryError error={shop.error} onRetry={() => shop.refetch()} />;
  if (!shop.data) return <PageSkeleton />;
  const s = shop.data;
  const phone = s.phones.find((p) => p.primary)?.number;
  const route = routes.data?.find((r) => r.id === s.routeId);

  const ledgerColumns: DataTableColumn<ShopLedgerEntry>[] = [
    {
      id: 'at',
      header: t('fields.date'),
      width: 'w-44',
      cell: (e) => formatDateTime(e.at, { locale }),
    },
    {
      id: 'what',
      header: t('fields.entry'),
      primary: true,
      cell: (e) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={KIND_TONE[e.kind]} size="sm">
            {t(`ledger.${e.kind}`)}
          </StatusBadge>
          {e.kind === 'INVOICE' && e.refId ? (
            <Link
              to={`/wholesale/field-sales/${e.refId}`}
              className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {e.number}
            </Link>
          ) : e.kind === 'RETURN' && e.refId ? (
            <Link
              to={`/wholesale/returns/${e.refId}`}
              className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {e.number}
            </Link>
          ) : (
            <span className="font-medium">{e.number ?? ''}</span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      header: t('fields.amount'),
      align: 'right',
      width: 'w-32',
      cell: (e) => <MoneyText value={e.amount} locale={locale} />,
    },
    {
      id: 'balance',
      header: t('fields.balance'),
      align: 'right',
      width: 'w-32',
      cell: (e) => <MoneyText value={e.balance} locale={locale} className="font-semibold" />,
    },
  ];

  const collectionColumns: DataTableColumn<WholesaleCollection>[] = [
    {
      id: 'number',
      header: t('fields.collection'),
      primary: true,
      width: 'w-36',
      cell: (c) => <span className="font-semibold">{c.number}</span>,
    },
    { id: 'at', header: t('fields.date'), cell: (c) => formatDateTime(c.at, { locale }) },
    { id: 'method', header: t('fields.method'), cell: (c) => t(`method.${c.method}`) },
    {
      id: 'amount',
      header: t('fields.amount'),
      align: 'right',
      width: 'w-32',
      cell: (c) => <MoneyText value={c.amount} locale={locale} className="font-medium" />,
    },
  ];

  const returnColumns: DataTableColumn<WholesaleReturn>[] = [
    {
      id: 'number',
      header: t('fields.return'),
      primary: true,
      width: 'w-36',
      cell: (r) => <span className="font-semibold">{r.number}</span>,
    },
    { id: 'at', header: t('fields.date'), cell: (r) => formatDateTime(r.at, { locale }) },
    {
      id: 'items',
      header: t('fields.items'),
      hideOnTablet: true,
      cell: (r) => (
        <span className="text-sm">{r.lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')}</span>
      ),
    },
    {
      id: 'credit',
      header: t('fields.credit'),
      align: 'right',
      width: 'w-32',
      cell: (r) => <MoneyText value={r.credit} locale={locale} className="font-medium" />,
    },
  ];

  return (
    <Screen id="WHO-002" title={s.name} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.name}
            {!s.isActive && (
              <StatusBadge tone="neutral" size="md">
                {t('shops.inactive')}
              </StatusBadge>
            )}
          </span>
        }
        description={[s.code, s.ownerName, s.area].filter(Boolean).join(' · ')}
        actions={
          <>
            {canSell.from(route?.vanLocationId) && (
              <Button asChild>
                <Link to={`/wholesale/field-sales?${new URLSearchParams({ shop: s.id })}`}>
                  <ShoppingCartIcon /> {t('shop.sell')}
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              disabled={s.outstanding.amount <= 0}
              onClick={() => setCollecting(true)}
            >
              <HandCoinsIcon /> {t('shop.collect')}
            </Button>
          </>
        }
        secondaryActions={[
          {
            id: 'return',
            label: t('shop.return'),
            icon: <Undo2Icon />,
            onSelect: () =>
              navigate(`/wholesale/returns/new?${new URLSearchParams({ shop: s.id })}`),
          },
          {
            id: 'edit',
            label: t('shop.edit'),
            icon: <PencilIcon />,
            onSelect: () => setEditing(true),
          },
        ]}
        moreLabel={t('more')}
      />

      {s.overLimit && (
        <Alert tone="danger" title={t('shop.overLimitTitle')}>
          {t('shop.overLimitHint')}
        </Alert>
      )}
      {!s.overLimit && s.overdue.amount > 0 && (
        <Alert tone="warning" title={t('shop.overdueTitle')}>
          <MoneyText value={s.overdue} locale={locale} /> ·{' '}
          {t('shop.overdueHint', { days: s.paymentTermsDays })}
        </Alert>
      )}

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('fields.outstanding')}>
          <MoneyText value={s.outstanding} locale={locale} className="text-lg font-semibold" />
          <CreditBar outstanding={s.outstanding} limit={s.creditLimit} className="mt-1" />
        </Fact>
        <Fact label={t('fields.terms')}>{t('shop.termsDays', { count: s.paymentTermsDays })}</Fact>
        <Fact label={t('fields.phone')}>
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              <PhoneIcon className="size-4" aria-hidden /> {formatPhone(phone)}
            </a>
          ) : (
            '—'
          )}
        </Fact>
        <Fact label={t('fields.route')}>
          {route ? (
            <Link
              to={`/wholesale/routes?${new URLSearchParams({ route: route.id })}`}
              className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {route.name} · {t('shops.stop', { n: s.stopOrder })}
            </Link>
          ) : (
            '—'
          )}
        </Fact>
        {s.address && <Fact label={t('fields.address')}>{s.address}</Fact>}
        {s.notes && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Fact label={t('fields.notes')}>{s.notes}</Fact>
          </div>
        )}
      </Card>

      <Tabs defaultValue="statement">
        <TabsList>
          <TabsTrigger value="statement">{t('shop.statement')}</TabsTrigger>
          <TabsTrigger value="invoices">{t('shop.invoices')}</TabsTrigger>
          <TabsTrigger value="collections">{t('shop.collections')}</TabsTrigger>
          <TabsTrigger value="returns">{t('shop.returns')}</TabsTrigger>
        </TabsList>
        <TabsContent value="statement">
          <Card className="p-0">
            <DataTable
              caption={t('shop.statement')}
              columns={ledgerColumns}
              rows={ledger.data ? [...ledger.data].reverse() : undefined}
              getRowId={(e) => e.id}
              getRowLabel={(e) => `${t(`ledger.${e.kind}`)} ${e.number ?? ''}`}
              loading={ledger.isPending}
              empty={<EmptyState icon={HistoryIcon} title={t('shop.noHistory')} />}
            />
          </Card>
        </TabsContent>
        <TabsContent value="invoices">
          <Card className="p-0">
            <InvoiceTable
              caption={t('shop.invoices')}
              rows={invoices.data}
              loading={invoices.isPending}
              showShop={false}
              empty={<EmptyState icon={HistoryIcon} title={t('shop.noInvoices')} />}
            />
          </Card>
        </TabsContent>
        <TabsContent value="collections">
          <Card className="p-0">
            <DataTable
              caption={t('shop.collections')}
              columns={collectionColumns}
              rows={collections.data}
              getRowId={(c) => c.id}
              getRowLabel={(c) => c.number}
              loading={collections.isPending}
              empty={<EmptyState icon={HistoryIcon} title={t('shop.noCollections')} />}
            />
          </Card>
        </TabsContent>
        <TabsContent value="returns">
          <Card className="p-0">
            <DataTable
              caption={t('shop.returns')}
              columns={returnColumns}
              rows={returns.data}
              getRowId={(r) => r.id}
              getRowLabel={(r) => r.number}
              loading={returns.isPending}
              onRowClick={(r) => navigate(`/wholesale/returns/${r.id}`)}
              empty={<EmptyState icon={HistoryIcon} title={t('shop.noReturns')} />}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <EntityHistory entity="wholesale-shop" entityId={s.id} />

      <ShopDialog open={editing} onOpenChange={setEditing} shop={s} />
      <CollectionDialog shop={collecting ? s : null} onOpenChange={setCollecting} />
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
