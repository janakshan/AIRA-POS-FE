import type { Money, StaffReportRow } from '@rbp/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import { cn, formatMoney } from '@rbp/utils';
import {
  BanknoteIcon,
  ClockIcon,
  TimerOffIcon,
  UserXIcon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { useStaffReport } from '../api/queries';
import { RankBars } from '../components/bar-chart';
import { ReportShell } from '../components/report-shell';
import { type CsvColumn, csvMoney, downloadCsv, toCsv } from '../lib/csv';
import { fileStem, useReportParams } from '../lib/period';

/** Over/short with its sign, coloured when it's off (negative = short). */
function Variance({ value, locale }: { value: Money; locale: string }) {
  return (
    <span
      className={cn(
        'tabular',
        value.amount < 0 && 'text-status-danger-fg',
        value.amount > 0 && 'text-status-warning-fg',
      )}
    >
      {value.amount > 0 ? '+' : ''}
      {formatMoney(value, locale)}
    </span>
  );
}

/**
 * REP-007 Staff report (A-294): per employee over the period — hours and attendance against
 * the roster, sales (as REP-001 by cashier), cash drawer over/short and staff meals.
 */
export function StaffReportPage() {
  const { t, i18n } = useTranslation('reports');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const rp = useReportParams();
  const report = useStaffReport(rp.params);
  const r = report.data;
  const hours = (minutes: number) =>
    t('staff.duration', { h: Math.floor(minutes / 60), m: minutes % 60 });

  const columns: DataTableColumn<StaffReportRow>[] = [
    {
      id: 'employee',
      header: t('staff.cols.employee'),
      primary: true,
      cell: (x) => (
        <span>
          <span className="font-medium">{x.name}</span>
          <span className="block text-xs text-muted-foreground">
            {x.employeeId ? x.jobTitle : t('staff.notListed')}
          </span>
        </span>
      ),
    },
    {
      id: 'shifts',
      header: t('staff.cols.shifts'),
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) => (
        <span className="tabular">
          {t('staff.shiftsOf', { worked: x.worked - x.unrostered, rostered: x.rostered })}
          {x.unrostered > 0 && (
            <span className="block text-xs text-muted-foreground">
              {t('staff.extra', { count: x.unrostered })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'hours',
      header: t('staff.cols.hours'),
      align: 'right',
      width: 'w-28',
      cell: (x) => <span className="tabular">{hours(x.minutes)}</span>,
    },
    {
      id: 'late',
      header: t('staff.cols.late'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) =>
        x.late ? (
          <span className="text-status-warning-fg tabular">
            {t('staff.lateCell', { count: x.late, minutes: hours(x.lateMinutes) })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'absent',
      header: t('staff.cols.absent'),
      align: 'right',
      width: 'w-20',
      hideOnTablet: true,
      cell: (x) =>
        x.absent ? (
          <span className="font-semibold text-status-danger-fg tabular">{x.absent}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'orders',
      header: t('cols.orders'),
      align: 'right',
      width: 'w-20',
      hideOnTablet: true,
      cell: (x) => <span className="tabular">{x.orders}</span>,
    },
    {
      id: 'net',
      header: t('cols.net'),
      align: 'right',
      width: 'w-32',
      cell: (x) => (
        <span>
          <MoneyText value={x.net} locale={locale} className="font-medium" />
          {x.refunds.amount > 0 && (
            <span className="block text-xs text-muted-foreground">
              {t('cols.refunds')} {formatMoney(x.refunds, locale)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'drawer',
      header: t('staff.cols.drawer'),
      align: 'right',
      width: 'w-32',
      hideOnTablet: true,
      cell: (x) =>
        x.shiftsClosed ? (
          <span>
            <Variance value={x.variance} locale={locale} />
            <span className="block text-xs text-muted-foreground">
              {t('staff.varianceHint', { count: x.shiftsClosed })}
              {x.shortShifts > 0 && ` · ${t('staff.shortShifts', { count: x.shortShifts })}`}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'meals',
      header: t('staff.cols.meals'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) =>
        x.meals ? (
          <span>
            <MoneyText value={x.mealValue} locale={locale} />
            <span className="block text-xs text-muted-foreground">
              {t('staff.mealsHint', { count: x.meals })}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const csv = () => {
    if (!r) return;
    const cols: CsvColumn<StaffReportRow>[] = [
      { header: 'Employee', value: (x) => x.name },
      { header: 'Job title', value: (x) => x.jobTitle },
      { header: 'Rostered shifts', value: (x) => x.rostered },
      { header: 'Days worked', value: (x) => x.worked },
      { header: 'Unrostered days', value: (x) => x.unrostered },
      { header: 'Hours', value: (x) => (x.minutes / 60).toFixed(2) },
      { header: 'Late', value: (x) => x.late },
      { header: 'Late minutes', value: (x) => x.lateMinutes },
      { header: 'Absent', value: (x) => x.absent },
      { header: 'Orders', value: (x) => x.orders },
      { header: 'Net sales', value: (x) => csvMoney(x.net) },
      { header: 'Discounts', value: (x) => csvMoney(x.discounts) },
      { header: 'Refunds', value: (x) => csvMoney(x.refunds) },
      { header: 'Shifts closed', value: (x) => x.shiftsClosed },
      { header: 'Drawer over/short', value: (x) => csvMoney(x.variance) },
      { header: 'Short shifts', value: (x) => x.shortShifts },
      { header: 'Staff meals', value: (x) => x.meals },
      { header: 'Meal value', value: (x) => csvMoney(x.mealValue) },
    ];
    downloadCsv(fileStem('staff', r.from, r.to), toCsv(r.rows, cols));
  };

  const byHours = r
    ? [...r.rows].filter((x) => x.minutes > 0).sort((a, b) => b.minutes - a.minutes)
    : [];
  const bySales = r
    ? [...r.rows].filter((x) => x.orders > 0).sort((a, b) => b.net.amount - a.net.amount)
    : [];

  return (
    <ReportShell
      id="REP-007"
      title={t('staff.title')}
      description={t('staff.hint')}
      rp={rp}
      onCsv={csv}
      csvDisabled={!r}
    >
      {report.isError ? (
        <QueryError error={report.error} onRetry={() => report.refetch()} />
      ) : !r ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              label={t('staff.hours')}
              icon={ClockIcon}
              value={hours(r.totals.minutes)}
              hint={t('staff.hoursHint', { count: r.totals.worked })}
            />
            <StatCard
              label={t('staff.late')}
              icon={TimerOffIcon}
              value={r.totals.late}
              hint={t('staff.lateHint', { minutes: hours(r.totals.lateMinutes) })}
            />
            <StatCard
              label={t('staff.absent')}
              icon={UserXIcon}
              value={r.totals.absent}
              hint={t('staff.absentHint', { count: r.totals.rostered })}
            />
            <StatCard
              label={t('staff.sales')}
              icon={BanknoteIcon}
              value={<MoneyText value={r.totals.net} locale={locale} />}
              hint={t('staff.salesHint', { count: r.totals.orders })}
            />
            <StatCard
              label={t('staff.variance')}
              icon={WalletIcon}
              value={<Variance value={r.totals.variance} locale={locale} />}
              hint={t('staff.varianceHint', { count: r.totals.shiftsClosed })}
            />
            <StatCard
              label={t('staff.meals')}
              icon={UtensilsIcon}
              value={<MoneyText value={r.totals.mealValue} locale={locale} />}
              hint={t('staff.mealsHint', { count: r.totals.meals })}
            />
          </div>
          <Card className="p-0">
            <DataTable
              caption={t('staff.caption')}
              columns={columns}
              rows={r.rows}
              getRowId={(x) => x.employeeId ?? `name:${x.name}`}
              getRowLabel={(x) => x.name}
              loading={false}
              onRowClick={(x) => x.employeeId && navigate(`/staff/employees/${x.employeeId}`)}
              empty={<EmptyState icon={UsersIcon} title={t('staff.none')} />}
            />
          </Card>
          {(byHours.length > 0 || bySales.length > 0) && (
            <div className="grid items-start gap-section lg:grid-cols-2">
              {byHours.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('staff.hoursBy')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RankBars
                      caption={t('staff.hoursBy')}
                      data={byHours.map((x) => ({
                        key: x.employeeId ?? x.name,
                        label: x.name,
                        title: x.name,
                        value: x.minutes,
                        display: hours(x.minutes),
                      }))}
                    />
                  </CardContent>
                </Card>
              )}
              {bySales.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('staff.salesBy')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RankBars
                      caption={t('staff.salesBy')}
                      data={bySales.map((x) => ({
                        key: x.employeeId ?? x.name,
                        label: x.name,
                        title: x.name,
                        value: x.net.amount,
                        display: formatMoney(x.net, locale),
                      }))}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </ReportShell>
  );
}
