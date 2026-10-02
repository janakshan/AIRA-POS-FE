import type { FoodAllowanceRow } from '@rbp/types';
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
  toast,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { AlertTriangleIcon, CopyIcon, UtensilsIcon, WalletIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useFoodAllowance } from '../api/queries';
import { MonthPicker } from '../components/month-picker';
import { monthLabel, thisMonth } from '../lib/dates';

/**
 * HR-006 Food allowance (§23): each employee's monthly allowance against the staff meals they
 * had. Within it → nothing to deduct; over it → the excess goes to salary deduction / payroll.
 */
export function AllowancePage() {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const list = useListParams({ filterKeys: ['month'] });
  const month = list.filters.month ?? thisMonth();
  const data = useFoodAllowance(month);
  const d = data.data;
  const over = d?.rows.filter((r) => r.excess.amount > 0) ?? [];

  const copy = async () => {
    if (!d) return;
    const csv = [
      ['Code', 'Employee', 'Allowance', 'Consumed', 'Excess for deduction'].join(','),
      ...d.rows.map((r) =>
        [
          r.code,
          r.employeeName,
          r.allowance.amount / 100,
          r.consumed.amount / 100,
          r.excess.amount / 100,
        ].join(','),
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(t('allowance.copied'));
    } catch {
      toast.error(t('allowance.copyFailed'));
    }
  };

  const columns: DataTableColumn<FoodAllowanceRow>[] = [
    {
      id: 'employee',
      header: t('fields.employee'),
      primary: true,
      cell: (r) => (
        <span>
          <Link
            to={`/staff/employees/${r.employeeId}`}
            className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {r.employeeName}
          </Link>
          <span className="block text-xs text-muted-foreground">
            {r.code} · {r.jobTitle}
          </span>
        </span>
      ),
    },
    {
      id: 'allowance',
      header: t('fields.allowance'),
      align: 'right',
      width: 'w-32',
      cell: (r) => <MoneyText value={r.allowance} locale={locale} />,
    },
    {
      id: 'consumed',
      header: t('allowance.consumed'),
      align: 'right',
      width: 'w-32',
      cell: (r) => (
        <span className="tabular">
          <MoneyText value={r.consumed} locale={locale} />
          <span className="block text-xs text-muted-foreground">
            {t('meals.count', { count: r.meals })}
          </span>
        </span>
      ),
    },
    {
      id: 'remaining',
      header: t('allowance.remaining'),
      align: 'right',
      width: 'w-32',
      hideOnTablet: true,
      cell: (r) => <MoneyText value={r.remaining} locale={locale} />,
    },
    {
      id: 'excess',
      header: t('allowance.excess'),
      align: 'right',
      width: 'w-36',
      cell: (r) =>
        r.excess.amount ? (
          <MoneyText
            value={r.excess}
            locale={locale}
            className="font-semibold text-status-danger-fg"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <Screen id="HR-006" title={t('allowance.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('allowance.title')}
        description={t('allowance.hint')}
        actions={
          <Button variant="outline" disabled={!d} onClick={() => void copy()}>
            <CopyIcon /> {t('allowance.copy')}
          </Button>
        }
      />
      {data.isError ? (
        <QueryError error={data.error} onRetry={() => data.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label={t('allowance.totalAllowance')}
            icon={WalletIcon}
            value={d ? <MoneyText value={d.totals.allowance} locale={locale} /> : '—'}
          />
          <StatCard
            label={t('allowance.totalConsumed', { month: monthLabel(month, locale) })}
            icon={UtensilsIcon}
            value={d ? <MoneyText value={d.totals.consumed} locale={locale} /> : '—'}
          />
          <StatCard
            label={t('allowance.totalExcess')}
            icon={AlertTriangleIcon}
            value={d ? <MoneyText value={d.totals.excess} locale={locale} /> : '—'}
            hint={
              over.length
                ? t('allowance.overCount', {
                    count: over.length,
                    names: over
                      .map((r) => `${r.employeeName} ${formatMoney(r.excess, locale)}`)
                      .join(', '),
                  })
                : t('allowance.noneOver')
            }
          />
        </div>
      )}
      <Card className="p-0">
        <DataTable
          caption={t('allowance.caption')}
          columns={columns}
          rows={d?.rows}
          getRowId={(r) => r.employeeId}
          getRowLabel={(r) => r.employeeName}
          loading={data.isPending}
          empty={<EmptyState icon={UtensilsIcon} title={t('allowance.empty')} />}
          toolbar={
            <FilterBar
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
    </Screen>
  );
}
