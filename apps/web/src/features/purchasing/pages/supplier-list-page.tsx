import type { Supplier } from '@rbp/types';
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
import { formatDate, formatPhone } from '@rbp/utils';
import { PlusIcon, SearchXIcon, TruckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useSuppliers } from '../api/queries';

const PAGE_SIZE = 20;
const ACTIVE = ['active', 'inactive'] as const;

/** PUR-001 Supplier list: who we buy from, what's on order and what's been received. */
export function SupplierListPage() {
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['status'] });
  const status = ACTIVE.find((s) => s === list.filters.status);
  const suppliers = useSuppliers({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(list.search ? { search: list.search } : {}),
    ...(status ? { active: status === 'active' } : {}),
  });

  const columns: DataTableColumn<Supplier>[] = [
    {
      id: 'code',
      header: t('fields.code'),
      width: 'w-24',
      hideOnTablet: true,
      cell: (s) => <span className="font-mono text-xs text-muted-foreground">{s.code}</span>,
    },
    {
      id: 'name',
      header: t('fields.name'),
      primary: true,
      cell: (s) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.name}</span>
          {!s.isActive && (
            <StatusBadge tone="neutral" size="sm">
              {t('suppliers.inactive')}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: 'contact',
      header: t('fields.contact'),
      cell: (s) => (
        <span className="text-sm">
          {s.contactName ?? <span className="text-muted-foreground">—</span>}
          {s.phone && (
            <span className="block text-xs text-muted-foreground tabular">
              {formatPhone(s.phone)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'open',
      header: t('fields.openOrders'),
      align: 'right',
      width: 'w-28',
      cell: (s) =>
        s.openOrders > 0 ? (
          <span className="font-semibold tabular">{s.openOrders}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'lastOrder',
      header: t('fields.lastOrder'),
      width: 'w-36',
      hideOnTablet: true,
      cell: (s) =>
        s.lastOrderAt ? (
          formatDate(s.lastOrderAt, { locale })
        ) : (
          <span className="text-muted-foreground">{t('suppliers.never')}</span>
        ),
    },
    {
      id: 'received',
      header: t('fields.totalReceived'),
      align: 'right',
      width: 'w-40',
      cell: (s) => <MoneyText value={s.totalReceived} locale={locale} />,
    },
  ];

  return (
    <Screen id="PUR-001" title={t('suppliers.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('suppliers.title')}
        description={t('suppliers.hint')}
        actions={
          <Button asChild>
            <Link to="new">
              <PlusIcon /> {t('suppliers.new')}
            </Link>
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('suppliers.caption')}
          columns={columns}
          rows={suppliers.data?.items}
          getRowId={(s) => s.id}
          getRowLabel={(s) => s.name}
          loading={suppliers.isPending}
          onRowClick={(s) => navigate(s.id)}
          error={
            suppliers.isError ? (
              <QueryError error={suppliers.error} onRetry={() => suppliers.refetch()} />
            ) : undefined
          }
          empty={
            list.search || status ? (
              <EmptyState icon={SearchXIcon} title={t('suppliers.noResults')} />
            ) : (
              <EmptyState
                icon={TruckIcon}
                title={t('suppliers.empty')}
                action={
                  <Button asChild>
                    <Link to="new">
                      <PlusIcon /> {t('suppliers.new')}
                    </Link>
                  </Button>
                }
              />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('suppliers.searchPlaceholder')}
                  aria-label={t('suppliers.search')}
                />
              }
              filters={([null, ...ACTIVE] as const).map((value) => (
                <FilterChip
                  key={value ?? 'all'}
                  active={(status ?? null) === value}
                  onClick={() => list.setFilter('status', value)}
                >
                  {t(`suppliers.filter.${value ?? 'all'}`)}
                </FilterChip>
              ))}
            />
          }
          footer={
            suppliers.data && suppliers.data.total > PAGE_SIZE ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={suppliers.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('summary', { from, to, total })}
                previousLabel={t('previous')}
                nextLabel={t('next')}
                pageLabel={(p) => t('page', { page: p })}
              />
            ) : undefined
          }
        />
      </Card>
    </Screen>
  );
}
