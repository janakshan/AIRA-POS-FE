import type { WholesalePriceRow } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  MoneyText,
  PageHeader,
} from '@rbp/ui';
import { formatDate } from '@rbp/utils';
import { PencilIcon, SearchXIcon, TagIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useWholesalePrices } from '../api/queries';
import { PriceDialog } from '../components/price-dialog';

/**
 * A-310 Wholesale prices: each product's retail and wholesale price (both VAT inclusive).
 * Needs `wholesale.prices` (owner, manager) — field sales reps sell at these prices but can't
 * change them.
 */
export function PricesPage() {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const list = useListParams({});
  const prices = useWholesalePrices(list.search ? { search: list.search } : {});
  const [editing, setEditing] = useState<WholesalePriceRow | null>(null);

  const columns: DataTableColumn<WholesalePriceRow>[] = [
    {
      id: 'product',
      header: t('fields.item'),
      primary: true,
      cell: (r) => (
        <span>
          <span className="font-medium">{r.name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{r.code}</span>
        </span>
      ),
    },
    {
      id: 'retail',
      header: t('prices.retail'),
      align: 'right',
      width: 'w-32',
      cell: (r) => <MoneyText value={r.retailPrice} locale={locale} />,
    },
    {
      id: 'wholesale',
      header: t('prices.wholesale'),
      align: 'right',
      width: 'w-40',
      cell: (r) =>
        r.price ? (
          <span className="block">
            <MoneyText value={r.price} locale={locale} className="font-semibold" />
            {r.retailPrice.amount > 0 && (
              <span className="block text-xs text-muted-foreground">
                {t('prices.ofRetail', {
                  percent: Math.round((r.price.amount / r.retailPrice.amount) * 100),
                })}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('prices.notSold')}</span>
        ),
    },
    {
      id: 'changed',
      header: t('prices.changed'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (r) =>
        r.updatedAt ? (
          <span className="text-sm">
            {formatDate(r.updatedAt, { locale })}
            {r.updatedBy && (
              <span className="block text-xs text-muted-foreground">{r.updatedBy}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'edit',
      header: <span className="sr-only">{t('prices.edit')}</span>,
      align: 'right',
      width: 'w-28',
      cell: (r) => (
        <Button
          variant="outline"
          size="sm"
          aria-label={t('prices.editOf', { name: r.name })}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(r);
          }}
        >
          <PencilIcon /> {r.price ? t('prices.edit') : t('prices.set')}
        </Button>
      ),
    },
  ];

  return (
    <Screen title={t('prices.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('prices.title')}
        description={t('prices.hint')}
      />
      <Card className="p-0">
        <DataTable
          caption={t('prices.caption')}
          columns={columns}
          rows={prices.data}
          getRowId={(r) => r.productId}
          getRowLabel={(r) => r.name}
          loading={prices.isPending}
          onRowClick={setEditing}
          error={
            prices.isError ? (
              <QueryError error={prices.error} onRetry={() => prices.refetch()} />
            ) : undefined
          }
          empty={
            list.search ? (
              <EmptyState icon={SearchXIcon} title={t('prices.noResults')} />
            ) : (
              <EmptyState icon={TagIcon} title={t('prices.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('prices.searchPlaceholder')}
                  aria-label={t('prices.search')}
                />
              }
            />
          }
        />
      </Card>
      <PriceDialog row={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </Screen>
  );
}
