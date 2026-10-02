import type { WholesaleCollection, WholesaleShop } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from '@rbp/ui';
import { formatDateTime, formatMoney, sumMoney } from '@rbp/utils';
import { ChevronDownIcon, HandCoinsIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCollections, useShops, useWholesaleRoutes } from '../api/queries';
import { CollectionDialog } from '../components/collection-dialog';

const RANGES = { today: 0, week: 6, month: 29 } as const;
type Range = keyof typeof RANGES;
const ANY_ROUTE = 'all';

/** WHO-004 Collections: money received from shops, and which invoices it paid. */
export function CollectionsPage() {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const list = useListParams({ filterKeys: ['range', 'route'] });
  const range: Range =
    (Object.keys(RANGES) as Range[]).find((r) => r === list.filters.range) ?? 'week';
  const routeId = list.filters.route ?? undefined;
  const routes = useWholesaleRoutes();
  const collections = useCollections({ days: RANGES[range], ...(routeId ? { routeId } : {}) });
  const owing = useShops({ balance: 'OWES' });
  const [collecting, setCollecting] = useState<WholesaleShop | null>(null);
  const rows = collections.data;
  const total = rows?.length
    ? sumMoney(
        rows.map((c) => c.amount),
        'LKR',
      )
    : null;

  const columns: DataTableColumn<WholesaleCollection>[] = [
    {
      id: 'number',
      header: t('fields.collection'),
      primary: true,
      width: 'w-36',
      cell: (c) => <span className="font-semibold">{c.number}</span>,
    },
    {
      id: 'shop',
      header: t('fields.shop'),
      cell: (c) => (
        <Link
          to={`/customers/external-shops/${c.shopId}`}
          className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
          onClick={(e) => e.stopPropagation()}
        >
          {c.shopName}
        </Link>
      ),
    },
    {
      id: 'at',
      header: t('fields.date'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (c) => formatDateTime(c.at, { locale }),
    },
    {
      id: 'method',
      header: t('fields.method'),
      width: 'w-36',
      cell: (c) => (
        <span className="text-sm">
          {t(`method.${c.method}`)}
          {c.reference && (
            <span className="block text-xs text-muted-foreground">{c.reference}</span>
          )}
        </span>
      ),
    },
    {
      id: 'applied',
      header: t('fields.appliedTo'),
      hideOnTablet: true,
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.allocations
            .map((a) => `${a.invoiceNumber} ${formatMoney(a.amount, locale)}`)
            .join(', ') || '—'}
        </span>
      ),
    },
    {
      id: 'amount',
      header: t('fields.amount'),
      align: 'right',
      width: 'w-32',
      cell: (c) => <MoneyText value={c.amount} locale={locale} className="font-semibold" />,
    },
  ];

  return (
    <Screen id="WHO-004" title={t('collections.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('collections.title')}
        description={t('collections.hint')}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!owing.data?.items.length}>
                <HandCoinsIcon /> {t('collections.record')} <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {owing.data?.items.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => setCollecting(s)}>
                  {s.name}
                  <span className="ml-auto pl-4 text-xs text-muted-foreground tabular">
                    {formatMoney(s.outstanding, locale)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t('collections.total', { range: t(`range.${range}`) })}
          icon={WalletIcon}
          value={total ? <MoneyText value={total} locale={locale} /> : '—'}
          hint={t('collections.count', { count: rows?.length ?? 0 })}
        />
        <StatCard
          label={t('collections.stillOwed')}
          icon={HandCoinsIcon}
          value={
            owing.data ? <MoneyText value={owing.data.summary.outstanding} locale={locale} /> : '—'
          }
          hint={t('collections.shopsOwing', { count: owing.data?.items.length ?? 0 })}
        />
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('collections.caption')}
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          getRowLabel={(c) => `${c.number} ${c.shopName}`}
          loading={collections.isPending}
          error={
            collections.isError ? (
              <QueryError error={collections.error} onRetry={() => collections.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={HandCoinsIcon} title={t('collections.empty')} />}
          toolbar={
            <FilterBar
              search={
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
              filters={(Object.keys(RANGES) as Range[]).map((r) => (
                <FilterChip
                  key={r}
                  active={range === r}
                  onClick={() => list.setFilter('range', r === 'week' ? null : r)}
                >
                  {t(`range.${r}`)}
                </FilterChip>
              ))}
            />
          }
        />
      </Card>
      <CollectionDialog shop={collecting} onOpenChange={(o) => !o && setCollecting(null)} />
    </Screen>
  );
}
