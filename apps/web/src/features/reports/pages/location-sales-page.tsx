import type { LocationSalesRow } from '@rbp/types';
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
  StatusBadge,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { StoreIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { useLocationReport } from '../api/queries';
import { BarChart } from '../components/bar-chart';
import { ReportShell } from '../components/report-shell';
import { csvMoney, downloadCsv, toCsv } from '../lib/csv';
import { fileStem, useReportParams } from '../lib/period';
import { sharePct } from '../lib/share';

const pct = (bps: number) => `${sharePct(bps)}%`;

/**
 * REP-003 Location sales: each outlet's net POS sales side by side (share of the total), with
 * its daily trend on a shared scale. Vans' wholesale invoices are shown apart (A-287).
 */
export function LocationSalesPage() {
  const { t, i18n } = useTranslation('reports');
  const locale = localeFor(i18n.language);
  const rp = useReportParams();
  const report = useLocationReport(rp.params);
  const r = report.data;
  const max = Math.max(0, ...(r?.rows.flatMap((x) => x.byDay.map((d) => d.net.amount)) ?? []));

  const columns: DataTableColumn<LocationSalesRow>[] = [
    {
      id: 'name',
      header: t('cols.location'),
      primary: true,
      cell: (x) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{x.name}</span>
          {x.channel === 'WHOLESALE' && (
            <StatusBadge tone="info" size="sm">
              {t('locations.wholesale')}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: 'net',
      header: t('cols.net'),
      align: 'right',
      width: 'w-36',
      cell: (x) => <MoneyText value={x.net} locale={locale} className="font-semibold" />,
    },
    {
      id: 'orders',
      header: t('cols.orders'),
      align: 'right',
      width: 'w-20',
      cell: (x) => <span className="tabular">{x.orders}</span>,
    },
    {
      id: 'avg',
      header: t('cols.average'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) => <MoneyText value={x.averageOrder} locale={locale} />,
    },
    {
      id: 'discounts',
      header: t('cols.discounts'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) => <MoneyText value={x.discounts} locale={locale} />,
    },
    {
      id: 'refunds',
      header: t('cols.refunds'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) => <MoneyText value={x.refunds} locale={locale} />,
    },
    {
      id: 'share',
      header: t('cols.share'),
      align: 'right',
      width: 'w-20',
      cell: (x) => (x.channel === 'POS' ? <span className="tabular">{pct(x.shareBps)}</span> : '—'),
    },
  ];

  const csv = () =>
    r &&
    downloadCsv(
      fileStem('location-sales', r.from, r.to),
      toCsv(r.rows, [
        { header: 'Location', value: (x) => x.name },
        { header: 'Channel', value: (x) => x.channel },
        { header: 'Net', value: (x) => csvMoney(x.net) },
        { header: 'Orders / invoices', value: (x) => x.orders },
        { header: 'Average', value: (x) => csvMoney(x.averageOrder) },
        { header: 'Discounts', value: (x) => csvMoney(x.discounts) },
        { header: 'Refunds / returns', value: (x) => csvMoney(x.refunds) },
        {
          header: 'Share % (POS)',
          value: (x) => (x.channel === 'POS' ? sharePct(x.shareBps) : ''),
        },
      ]),
    );

  return (
    <ReportShell
      id="REP-003"
      title={t('locations.title')}
      description={t('locations.hint')}
      rp={rp}
      onCsv={() => void csv()}
      csvDisabled={!r?.rows.length}
    >
      {report.isError ? (
        <QueryError error={report.error} onRetry={() => report.refetch()} />
      ) : !r ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card className="p-0">
            <DataTable
              caption={t('locations.caption')}
              columns={columns}
              rows={r.rows}
              getRowId={(x) => x.locationId}
              getRowLabel={(x) => x.name}
              loading={false}
              empty={<EmptyState icon={StoreIcon} title={t('empty')} />}
              footer={
                <p className="px-4 py-3 text-sm font-medium">
                  {t('locations.total', {
                    amount: formatMoney(r.totals.net, locale),
                    count: r.totals.orders,
                  })}
                </p>
              }
            />
          </Card>
          <div className="grid gap-section md:grid-cols-2">
            {r.rows.map((x) => (
              <Card key={x.locationId}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('locations.trend', { name: x.name })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChart
                    caption={t('locations.trend', { name: x.name })}
                    emptyLabel={t('empty')}
                    height="h-28"
                    max={max}
                    labelEvery={Math.ceil(x.byDay.length / 8)}
                    data={x.byDay.map((d) => ({
                      key: d.date,
                      label: d.date.slice(8),
                      title: formatPlainDate(d.date, locale),
                      value: d.net.amount,
                      display: formatMoney(d.net, locale),
                    }))}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </ReportShell>
  );
}
