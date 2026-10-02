import type { StaffMeal } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  MoneyText,
  PageHeader,
  StatCard,
  StatusBadge,
} from '@rbp/ui';
import { formatDateTime, sumMoney } from '@rbp/utils';
import { UtensilsIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useStaffMeals } from '../api/queries';
import { StaffMealDialog } from '../components/staff-meal-dialog';
import { VoidedMealBadge, VoidMealButton } from '../components/void-meal-button';
import { MonthPicker } from '../components/month-picker';
import { monthLabel, thisMonth } from '../lib/dates';

/**
 * HR-005 Staff meals (§22): food eaten by staff — no payment, but it leaves stock like a sale
 * (recipe dishes use their ingredients) and counts against the monthly allowance (HR-006).
 */
export function StaffMealsPage() {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const { can } = useAccess();
  const { current } = useMyLocations();
  const list = useListParams({ filterKeys: ['month', 'location'] });
  const month = list.filters.month ?? thisMonth();
  const locationId = list.filters.location ?? current?.id ?? '';
  const meals = useStaffMeals({ month, ...(locationId ? { locationId } : {}) });
  const [recording, setRecording] = useState(false);
  const rows = meals.data;
  // A-312: voided meals stay listed but don't count.
  const counted = rows?.filter((m) => m.status !== 'VOIDED');
  const total = counted?.length
    ? sumMoney(
        counted.map((m) => m.value),
        'LKR',
      )
    : null;

  const columns: DataTableColumn<StaffMeal>[] = [
    {
      id: 'number',
      header: t('fields.meal'),
      primary: true,
      width: 'w-36',
      cell: (m) => (
        <span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{m.number}</span>
            <VoidedMealBadge meal={m} />
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatDateTime(m.at, { locale })}
          </span>
        </span>
      ),
    },
    {
      id: 'employee',
      header: t('fields.employee'),
      cell: (m) => (
        <Link
          to={`/staff/employees/${m.employeeId}`}
          className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {m.employeeName}
        </Link>
      ),
    },
    {
      id: 'items',
      header: t('fields.items'),
      hideOnTablet: true,
      cell: (m) => (
        <span className="text-sm">{m.lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')}</span>
      ),
    },
    {
      id: 'source',
      header: t('fields.source'),
      width: 'w-40',
      hideOnTablet: true,
      cell: (m) => (
        <span className="text-sm">
          <StatusBadge tone={m.source === 'POS' ? 'info' : 'neutral'} size="sm">
            {t(`meals.source.${m.source}`)}
          </StatusBadge>
          <span className="block text-xs text-muted-foreground">
            {t('meals.approvedBy', { name: m.approvedBy })}
          </span>
        </span>
      ),
    },
    {
      id: 'value',
      header: t('fields.value'),
      align: 'right',
      width: 'w-32',
      cell: (m) => (
        <MoneyText
          value={m.value}
          locale={locale}
          className={m.status === 'VOIDED' ? 'text-muted-foreground line-through' : 'font-semibold'}
        />
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('voidMeal.action')}</span>,
      align: 'right',
      width: 'w-28',
      cell: (m) => <VoidMealButton meal={m} />,
    },
  ];

  return (
    <Screen id="HR-005" title={t('meals.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('meals.title')}
        description={t('meals.hint')}
        actions={
          <Button onClick={() => setRecording(true)} disabled={!locationId}>
            <UtensilsIcon /> {t('meals.record')}
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t('meals.valueMonth', { month: monthLabel(month, locale) })}
          icon={WalletIcon}
          value={total ? <MoneyText value={total} locale={locale} /> : '—'}
          hint={t('meals.count', { count: counted?.length ?? 0 })}
        />
        {can('staff.manage') && (
          <StatCard
            label={t('meals.allowanceLink')}
            icon={UtensilsIcon}
            value={
              <Link
                to={`/staff/allowance?${new URLSearchParams({ month })}`}
                className="text-base underline-offset-2 hover:underline"
              >
                {t('meals.seeAllowance')}
              </Link>
            }
          />
        )}
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('meals.caption')}
          columns={columns}
          rows={rows}
          getRowId={(m) => m.id}
          getRowLabel={(m) => `${m.number} ${m.employeeName}`}
          loading={meals.isPending}
          error={
            meals.isError ? (
              <QueryError error={meals.error} onRetry={() => meals.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={UtensilsIcon} title={t('meals.empty')} />}
          toolbar={
            <FilterBar
              search={
                <LocationSelect
                  value={locationId}
                  onChange={(v) => list.setFilter('location', v === current?.id ? null : v)}
                  label={t('fields.location')}
                />
              }
              filters={
                <MonthPicker
                  month={month}
                  onChange={(m) => list.setFilter('month', m === thisMonth() ? null : m)}
                />
              }
            />
          }
        />
      </Card>
      <StaffMealDialog
        open={recording}
        onOpenChange={setRecording}
        locationId={locationId}
        source="HR"
      />
    </Screen>
  );
}
