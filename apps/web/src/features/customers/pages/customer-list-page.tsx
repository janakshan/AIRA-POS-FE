import type { Customer, CustomerSort, CustomerType } from '@rbp/types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
} from '@rbp/ui';
import { formatDate, formatPhone, normalizePhone } from '@rbp/utils';
import { PlusIcon, SearchXIcon, UserPlusIcon, UsersIcon, WalletIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCustomerSearch } from '../api/queries';
import { CustomerTypeBadge } from '../components/customer-type-badge';

const PAGE_SIZE = 20;
const TYPES: CustomerType[] = ['RETAIL', 'REGULAR', 'CORPORATE'];
const SORTS: CustomerSort[] = ['name', 'lastOrder', 'outstanding'];

/** CUS-001 Customer list: search by name or phone, filter by type and balance. */
export function CustomerListPage() {
  const { t, i18n } = useTranslation('customers');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { can } = useAccess();
  const canManage = can('customer.manage');
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['type', 'owes', 'sort'] });
  const type = TYPES.find((x) => x === list.filters.type);
  const sort = SORTS.find((x) => x === list.filters.sort) ?? 'name';
  const owes = list.filters.owes === 'yes';
  const customers = useCustomerSearch({
    page: list.page,
    pageSize: PAGE_SIZE,
    sort,
    ...(list.search ? { search: list.search } : {}),
    ...(type ? { type } : {}),
    ...(owes ? { owes: true } : {}),
  });
  const summary = customers.data?.summary;
  // A full phone number with no match: offer to create the customer with it.
  const typedPhone = normalizePhone(list.search);
  const offerCreate = canManage && !!typedPhone && customers.data?.total === 0;

  const columns: DataTableColumn<Customer>[] = [
    {
      id: 'name',
      header: t('fields.name'),
      primary: true,
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{c.name}</span>
          <CustomerTypeBadge type={c.type} />
        </span>
      ),
    },
    {
      id: 'phone',
      header: t('fields.phone'),
      cell: (c) => {
        const primary = c.phones.find((p) => p.primary) ?? c.phones[0];
        return (
          <span className="tabular">
            {primary ? formatPhone(primary.number) : ''}
            {c.phones.length > 1 && (
              <span className="ml-1 text-xs text-muted-foreground">
                {t('list.morePhones', { count: c.phones.length - 1 })}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'lastOrder',
      header: t('fields.lastOrder'),
      width: 'w-36',
      hideOnTablet: true,
      cell: (c) =>
        c.lastOrderAt ? (
          formatDate(c.lastOrderAt, { locale })
        ) : (
          <span className="text-muted-foreground">{t('list.never')}</span>
        ),
    },
    {
      id: 'outstanding',
      header: t('fields.outstanding'),
      align: 'right',
      width: 'w-40',
      cell: (c) =>
        c.outstanding.amount > 0 ? (
          <MoneyText
            value={c.outstanding}
            locale={locale}
            className="font-semibold text-status-warning-fg"
          />
        ) : (
          <span className="text-muted-foreground">{t('list.nothingOwed')}</span>
        ),
    },
  ];

  return (
    <Screen id="CUS-001" title={t('list.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('list.title')}
        description={t('list.hint')}
        actions={
          canManage && (
            <Button asChild>
              <Link to="new">
                <PlusIcon /> {t('list.new')}
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={t('list.totalOutstanding')}
          value={summary ? <MoneyText value={summary.totalOutstanding} locale={locale} /> : '—'}
          icon={WalletIcon}
          hint={summary ? t('list.owingCount', { count: summary.owingCount }) : undefined}
        />
        <StatCard
          label={t('list.customers')}
          value={customers.data ? String(customers.data.total) : '—'}
          icon={UsersIcon}
          hint={list.search || type || owes ? t('list.matching') : t('list.all')}
        />
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('list.caption')}
          columns={columns}
          rows={customers.data?.items}
          getRowId={(c) => c.id}
          getRowLabel={(c) => c.name}
          loading={customers.isPending}
          onRowClick={(c) => navigate(c.id)}
          error={
            customers.isError ? (
              <QueryError error={customers.error} onRetry={() => customers.refetch()} />
            ) : undefined
          }
          empty={
            offerCreate ? (
              <EmptyState
                icon={UserPlusIcon}
                title={t('list.noPhoneMatch', { phone: formatPhone(typedPhone) })}
                action={
                  <Button asChild>
                    <Link to={`new?${new URLSearchParams({ phone: list.search })}`}>
                      <UserPlusIcon /> {t('list.createWithPhone')}
                    </Link>
                  </Button>
                }
              />
            ) : list.search || type || owes ? (
              <EmptyState
                icon={SearchXIcon}
                title={t('list.noResults')}
                description={t('list.noResultsHint')}
              />
            ) : (
              <EmptyState icon={UsersIcon} title={t('list.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('list.searchPlaceholder')}
                  aria-label={t('list.search')}
                />
              }
              filters={
                <>
                  {([null, ...TYPES] as const).map((value) => (
                    <FilterChip
                      key={value ?? 'all'}
                      active={(type ?? null) === value}
                      onClick={() => list.setFilter('type', value)}
                    >
                      {value ? t(`type.${value}`) : t('list.allTypes')}
                    </FilterChip>
                  ))}
                  <FilterChip
                    active={owes}
                    onClick={() => list.setFilter('owes', owes ? null : 'yes')}
                  >
                    {t('list.owes')}
                  </FilterChip>
                  <Select
                    value={sort}
                    onValueChange={(v) => list.setFilter('sort', v === 'name' ? null : v)}
                  >
                    <SelectTrigger className="w-full sm:w-48" aria-label={t('list.sort')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`list.sortBy.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            />
          }
          footer={
            customers.data && customers.data.total > 0 ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={customers.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('list.summary', { from, to, total })}
                previousLabel={t('list.previous')}
                nextLabel={t('list.next')}
                pageLabel={(p) => t('list.page', { page: p })}
              />
            ) : undefined
          }
        />
      </Card>
    </Screen>
  );
}
