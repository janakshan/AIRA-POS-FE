import type { EmployeeView } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  MoneyText,
  PageHeader,
  StatusBadge,
} from '@rbp/ui';
import { formatMoney, formatPhone } from '@rbp/utils';
import { PlusIcon, SearchXIcon, UsersRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useStaffEmployees } from '../api/queries';
import { EmployeeDialog } from '../components/employee-dialog';

/** HR-001 Employees: who works where, who's in now, and this month's meals vs allowance. */
export function EmployeesPage() {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { can } = useAccess();
  const list = useListParams({ filterKeys: ['location'] });
  const locationId = list.filters.location ?? 'all';
  const employees = useStaffEmployees({
    ...(list.search ? { search: list.search } : {}),
    ...(locationId !== 'all' ? { locationId } : {}),
  });
  const [adding, setAdding] = useState(false);

  const columns: DataTableColumn<EmployeeView>[] = [
    {
      id: 'name',
      header: t('fields.name'),
      primary: true,
      cell: (e) => (
        <span>
          <span className="font-medium">{e.fullName}</span>
          <span className="block text-xs text-muted-foreground">
            {e.code} · {e.jobTitle}
          </span>
        </span>
      ),
    },
    {
      id: 'status',
      header: t('fields.status'),
      width: 'w-36',
      cell: (e) =>
        !e.isActive ? (
          <StatusBadge tone="neutral" size="sm">
            {t('employees.inactive')}
          </StatusBadge>
        ) : e.clockedIn ? (
          <StatusBadge tone="success" size="sm">
            {t('employees.inAt', { location: e.clockedIn.locationName })}
          </StatusBadge>
        ) : (
          <span className="text-sm text-muted-foreground">{t('employees.out')}</span>
        ),
    },
    {
      id: 'locations',
      header: t('fields.locations'),
      hideOnTablet: true,
      cell: (e) => <span className="text-sm">{e.locations.map((l) => l.name).join(', ')}</span>,
    },
    {
      id: 'phone',
      header: t('fields.phone'),
      width: 'w-40',
      hideOnTablet: true,
      cell: (e) => (e.phone ? formatPhone(e.phone) : '—'),
    },
    {
      id: 'meals',
      header: t('employees.mealsMonth'),
      align: 'right',
      width: 'w-40',
      cell: (e) => (
        <span className="tabular">
          <MoneyText
            value={e.mealsThisMonth}
            locale={locale}
            className={
              e.mealsThisMonth.amount > e.monthlyFoodAllowance.amount
                ? 'font-semibold text-status-danger-fg'
                : ''
            }
          />
          <span className="block text-xs text-muted-foreground">
            {t('employees.ofAllowance', {
              amount: formatMoney(e.monthlyFoodAllowance, locale),
            })}
          </span>
        </span>
      ),
    },
  ];

  return (
    <Screen id="HR-001" title={t('employees.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('employees.title')}
        description={t('employees.hint')}
        actions={
          can('staff.manage') && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> {t('employees.new')}
            </Button>
          )
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('employees.caption')}
          columns={columns}
          rows={employees.data}
          getRowId={(e) => e.id}
          getRowLabel={(e) => e.fullName}
          loading={employees.isPending}
          onRowClick={(e) => navigate(`/staff/employees/${e.id}`)}
          error={
            employees.isError ? (
              <QueryError error={employees.error} onRetry={() => employees.refetch()} />
            ) : undefined
          }
          empty={
            list.search ? (
              <EmptyState icon={SearchXIcon} title={t('employees.noResults')} />
            ) : (
              <EmptyState icon={UsersRoundIcon} title={t('employees.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('employees.searchPlaceholder')}
                  aria-label={t('employees.search')}
                />
              }
              filters={
                <LocationSelect
                  value={locationId}
                  onChange={(v) => list.setFilter('location', v === 'all' ? null : v)}
                  allowAll
                  label={t('fields.location')}
                />
              }
            />
          }
        />
      </Card>
      <EmployeeDialog open={adding} onOpenChange={setAdding} />
    </Screen>
  );
}
