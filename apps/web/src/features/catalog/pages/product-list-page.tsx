import type { Product } from '@rbp/types';
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
  Pagination,
  StatusBadge,
} from '@rbp/ui';
import { CheckIcon, PackageIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCategoryTree, useProducts } from '../api/queries';
import { CategorySelect } from '../components/category-select';
import { useLocalizedName } from '../lib/localized-name';

const PAGE_SIZE = 20;

/** CAT-003 Product List: server-paginated, filter by category subtree, status and search. */
export function ProductListPage() {
  const { t, i18n } = useTranslation('catalog');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { can } = useAccess();
  const canManage = can('catalog.manage');
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['category', 'status'] });
  const tree = useCategoryTree();
  const nameOf = useLocalizedName();
  const status = list.filters.status;
  const products = useProducts({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(list.search ? { search: list.search } : {}),
    ...(list.filters.category ? { categoryId: list.filters.category } : {}),
    ...(status ? { active: status === 'active' } : {}),
  });

  const categoryLabel = useMemo(() => {
    const byId = new Map<string, string>(
      tree.data?.map((c) => [c.id, [...c.path, c.name].join(' › ')]),
    );
    return (id: string) => byId.get(id) ?? '';
  }, [tree.data]);
  const categoryColor = useMemo(
    () => new Map<string, string>(tree.data?.map((c) => [c.id, c.color])),
    [tree.data],
  );

  const columns: DataTableColumn<Product>[] = [
    {
      id: 'code',
      header: t('common.code'),
      width: 'w-24',
      cell: (p) => <span className="font-mono text-xs">{p.code}</span>,
    },
    {
      id: 'name',
      header: t('common.name'),
      primary: true,
      cell: (p) => (
        <span className="flex items-center gap-2">
          {p.imageUrl && (
            <img src={p.imageUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
          )}
          <span className="font-medium">{nameOf(p)}</span>
          {!p.isActive && (
            <StatusBadge tone="neutral" size="sm">
              {t('common.inactive')}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: 'category',
      header: t('common.category'),
      cell: (p) => (
        <span className="flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: categoryColor.get(p.categoryId) }}
          />
          {categoryLabel(p.categoryId)}
        </span>
      ),
    },
    {
      id: 'price',
      header: t('products.basePrice'),
      align: 'right',
      width: 'w-36',
      cell: (p) => <MoneyText value={p.basePrice} locale={locale} />,
    },
    {
      id: 'tax',
      header: t('products.tax'),
      width: 'w-28',
      hideOnTablet: true,
      cell: (p) => t(`products.tax${p.taxMode}`),
    },
    {
      id: 'quickPad',
      header: t('products.quickPad'),
      width: 'w-28',
      align: 'center',
      hideOnTablet: true,
      cell: (p) =>
        p.showOnQuickPad ? (
          <CheckIcon
            className="mx-auto size-4 text-status-success"
            aria-label={t('products.onQuickPad')}
          />
        ) : (
          <span aria-hidden>{t('common.none')}</span>
        ),
    },
  ];

  return (
    <Screen id="CAT-003" title={t('nav:items.products')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('nav:items.products')}
        actions={
          canManage && (
            <Button asChild>
              <Link to="new">
                <PlusIcon /> {t('products.new')}
              </Link>
            </Button>
          )
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('products.caption')}
          columns={columns}
          rows={products.data?.items}
          getRowId={(p) => p.id}
          getRowLabel={(p) => p.name}
          loading={products.isPending}
          {...(canManage ? { onRowClick: (p: Product) => navigate(p.id) } : {})}
          error={
            products.isError ? (
              <QueryError error={products.error} onRetry={() => products.refetch()} />
            ) : undefined
          }
          empty={
            list.search || list.filters.category || status ? (
              <EmptyState
                icon={SearchXIcon}
                title={t('common.noResultsTitle')}
                description={t('common.noResultsHint')}
              />
            ) : (
              <EmptyState
                icon={PackageIcon}
                title={t('products.emptyTitle')}
                description={t('products.emptyHint')}
              />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('products.searchPlaceholder')}
                  aria-label={t('common.search')}
                />
              }
              filters={
                <>
                  <CategorySelect
                    tree={tree.data}
                    value={list.filters.category ?? null}
                    onChange={(v) => list.setFilter('category', v)}
                    placeholder={t('products.allCategories')}
                    noneLabel={t('products.allCategories')}
                    inactiveLabel={t('common.inactive')}
                    aria-label={t('common.category')}
                    className="w-full sm:w-56"
                  />
                  {(
                    [
                      [null, 'common.all'],
                      ['active', 'common.active'],
                      ['inactive', 'common.inactive'],
                    ] as const
                  ).map(([value, key]) => (
                    <FilterChip
                      key={key}
                      active={(status ?? null) === value}
                      onClick={() => list.setFilter('status', value)}
                    >
                      {t(key)}
                    </FilterChip>
                  ))}
                </>
              }
            />
          }
          footer={
            products.data && products.data.total > 0 ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={products.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('common.summary', { from, to, total })}
                previousLabel={t('common.previous')}
                nextLabel={t('common.next')}
                pageLabel={(p) => t('common.page', { page: p })}
              />
            ) : undefined
          }
        />
      </Card>
    </Screen>
  );
}
