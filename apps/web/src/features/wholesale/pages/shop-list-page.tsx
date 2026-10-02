import type { WholesaleShop, WholesaleShopListParams } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterChip,
  MoneyText,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  StatusBadge,
} from '@rbp/ui';
import { formatDate, formatPhone } from '@rbp/utils';
import { AlertTriangleIcon, PlusIcon, SearchXIcon, StoreIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useShops, useWholesaleRoutes } from '../api/queries';
import { CreditBar } from '../components/credit-bar';
import { ShopDialog } from '../components/shop-dialog';

const BALANCES = ['OWES', 'OVERDUE', 'OVER_LIMIT'] as const;
const ANY_ROUTE = 'all';

/** WHO-001 External shops (§25): who they are, what they owe, and against what limit. */
export function ShopListPage() {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const list = useListParams({ filterKeys: ['route', 'balance'] });
  const routes = useWholesaleRoutes();
  const balance = BALANCES.find((b) => b === list.filters.balance);
  const routeId = list.filters.route ?? undefined;
  const params: WholesaleShopListParams = {
    ...(list.search ? { search: list.search } : {}),
    ...(routeId ? { routeId } : {}),
    ...(balance ? { balance } : {}),
  };
  const shops = useShops(params);
  const [adding, setAdding] = useState(false);
  const routeName = (id: string | null) => routes.data?.find((r) => r.id === id)?.code ?? '—';
  const s = shops.data?.summary;

  const columns: DataTableColumn<WholesaleShop>[] = [
    {
      id: 'shop',
      header: t('fields.shop'),
      primary: true,
      cell: (x) => (
        <span>
          <span className="font-medium">{x.name}</span>
          <span className="block text-xs text-muted-foreground">
            {x.code}
            {x.ownerName ? ` · ${x.ownerName}` : ''}
          </span>
        </span>
      ),
    },
    {
      id: 'route',
      header: t('fields.route'),
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) => (
        <span className="text-sm">
          {routeName(x.routeId)}
          {x.routeId && (
            <span className="block text-xs text-muted-foreground">
              {t('shops.stop', { n: x.stopOrder })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'phone',
      header: t('fields.phone'),
      width: 'w-40',
      hideOnTablet: true,
      cell: (x) => {
        const phone = x.phones.find((p) => p.primary)?.number;
        return phone ? formatPhone(phone) : '—';
      },
    },
    {
      id: 'owes',
      header: t('fields.outstanding'),
      width: 'w-56',
      cell: (x) => (
        <span className="block space-y-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <MoneyText value={x.outstanding} locale={locale} className="font-semibold" />
            {x.overLimit && (
              <StatusBadge tone="danger" size="sm">
                {t('shops.overLimit')}
              </StatusBadge>
            )}
            {x.overdue.amount > 0 && (
              <StatusBadge tone="warning" size="sm">
                {t('shops.overdue')}
              </StatusBadge>
            )}
          </span>
          <CreditBar outstanding={x.outstanding} limit={x.creditLimit} />
        </span>
      ),
    },
    {
      id: 'visit',
      header: t('fields.lastVisit'),
      width: 'w-32',
      hideOnTablet: true,
      cell: (x) =>
        x.lastVisitAt ? (
          formatDate(x.lastVisitAt, { locale })
        ) : (
          <span className="text-muted-foreground">{t('shops.never')}</span>
        ),
    },
  ];

  return (
    <Screen id="WHO-001" title={t('shops.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('shops.title')}
        description={t('shops.hint')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> {t('shops.new')}
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('shops.count')} icon={StoreIcon} value={s?.shops ?? '—'} />
        <StatCard
          label={t('shops.totalOutstanding')}
          icon={WalletIcon}
          value={s ? <MoneyText value={s.outstanding} locale={locale} /> : '—'}
        />
        <StatCard
          label={t('shops.totalOverdue')}
          icon={AlertTriangleIcon}
          value={s ? <MoneyText value={s.overdue} locale={locale} /> : '—'}
          hint={s ? t('shops.overLimitCount', { count: s.overLimit }) : undefined}
        />
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('shops.caption')}
          columns={columns}
          rows={shops.data?.items}
          getRowId={(x) => x.id}
          getRowLabel={(x) => x.name}
          loading={shops.isPending}
          onRowClick={(x) => navigate(`/customers/external-shops/${x.id}`)}
          error={
            shops.isError ? (
              <QueryError error={shops.error} onRetry={() => shops.refetch()} />
            ) : undefined
          }
          empty={
            list.search || balance || routeId ? (
              <EmptyState icon={SearchXIcon} title={t('shops.noResults')} />
            ) : (
              <EmptyState icon={StoreIcon} title={t('shops.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('shops.searchPlaceholder')}
                  aria-label={t('shops.search')}
                />
              }
              // Chips get their own row on phones; the full-width route picker sits below them
              // instead of pushing Owes/Overdue/Over limit off-screen.
              filters={([null, ...BALANCES] as const).map((b) => (
                <FilterChip
                  key={b ?? 'any'}
                  active={(balance ?? null) === b}
                  onClick={() => list.setFilter('balance', b)}
                >
                  {t(`shops.balance.${b ?? 'ALL'}`)}
                </FilterChip>
              ))}
              actions={
                <Select
                  value={routeId ?? ANY_ROUTE}
                  onValueChange={(v) => list.setFilter('route', v === ANY_ROUTE ? null : v)}
                >
                  <SelectTrigger className="w-full sm:w-56" aria-label={t('fields.route')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_ROUTE}>{t('shops.anyRoute')}</SelectItem>
                    {routes.data?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          }
        />
      </Card>
      <ShopDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={(x) => navigate(`/customers/external-shops/${x.id}`)}
      />
    </Screen>
  );
}
